import 'server-only';

import { z } from 'zod';
import type { ApprovedLearningVersion, LearningSessionPlan } from '@/lib/content/learning-catalog';
import type { ContentBlock, ContextContent, Explanation, QuestionBody } from '@/types/db';
import type { PublicQuestionBody } from '@/lib/content/versions';
import type { LearningError, Receipt } from './contracts';
import type { ServerGradedItem } from './service';

type RpcResponse = { data: unknown; error: { message?: string } | null };
type CommitError = Exclude<LearningError, 'unauthenticated' | 'invalid-input'>;

export type LearningRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse>;
};

type ContentResponse = { data: unknown; error: unknown | null };

/** Narrow read port so tests can exercise decoders without a live Supabase client. */
export type LearningContentClient = {
  readApprovedVersions: (locale: 'ru' | 'kk') => Promise<ContentResponse>;
};

export type CommitRpcInput = {
  actorId: string;
  operationId: string;
  payloadHash: string;
  sessionId: string;
  scoringVersion: 'ent-v1';
  gradedItems: ServerGradedItem[];
};

export type StartedSessionReference = {
  id: string;
  mode: 'practice' | 'mock_exam' | 'diagnostic' | 'weekly';
  expiresAt: string;
  itemIds: string[];
};

export type StartedLearningReferences = { sessions: StartedSessionReference[] };

export type StartRpcInput = {
  actorId: string;
  operationId: string;
  payloadHash: string;
  plan: { sessions: LearningSessionPlan[] };
};

const knownErrors = new Set<CommitError>([
  'forbidden', 'not-found', 'expired', 'already-submitted',
  'operation-conflict', 'content-unavailable', 'rate-limited', 'temporarily-unavailable',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modes = new Set<StartedSessionReference['mode']>(['practice', 'mock_exam', 'diagnostic', 'weekly']);

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isStartedReferences(value: unknown): value is StartedLearningReferences {
  if (!isRecord(value) || !Array.isArray(value.sessions) || value.sessions.length < 1 || value.sessions.length > 2) {
    return false;
  }
  return value.sessions.every((session) => isRecord(session)
    && isUuid(session.id)
    && typeof session.mode === 'string' && modes.has(session.mode as StartedSessionReference['mode'])
    && typeof session.expiresAt === 'string' && !Number.isNaN(Date.parse(session.expiresAt))
    && Array.isArray(session.itemIds) && session.itemIds.length > 0 && session.itemIds.every(isUuid));
}

const optionSchema = z.object({ id: z.string().min(1).max(80), content: z.string() }).strict();
const textBlockSchema = z.object({ type: z.enum(['text', 'latex']).optional(), value: z.string() }).strict();
const imageBlockSchema = z.object({ type: z.literal('image'), value: z.string() }).strict();
const tableBlockSchema = z.object({
  type: z.literal('table'),
  columns: z.array(z.string()).max(30),
  rows: z.array(z.array(z.string()).max(30)).max(100),
}).strict();
const contentBlockSchema = z.union([textBlockSchema, imageBlockSchema, tableBlockSchema]);
const blocksSchema = z.array(contentBlockSchema).max(100);
const publicSingleSchema = z.object({ stem: z.string(), stem_blocks: blocksSchema.optional(), options: z.array(optionSchema).min(1).max(10) }).strict();
const publicMatchingSchema = z.object({ stem: z.string(), stem_blocks: blocksSchema.optional(), left: z.array(optionSchema).min(1).max(10), right: z.array(z.string()).min(1).max(10) }).strict();
const gradingSingleSchema = publicSingleSchema.extend({ correct: z.string().min(1).max(80) }).strict();
const gradingMultiSchema = publicSingleSchema.extend({ correct: z.array(z.string().min(1).max(80)).min(1).max(10) }).strict();
const matchingCorrectSchema = z.record(z.string().min(1).max(80), z.string().min(1).max(80)).superRefine((value, context) => {
  if (Object.keys(value).length > 10) {
    context.addIssue({ code: 'too_big', maximum: 10, origin: 'object', inclusive: true, message: 'too many pairs' });
  }
});
const gradingMatchingSchema = publicMatchingSchema.extend({ correct: matchingCorrectSchema }).strict();
const contextSchema = z.object({ blocks: blocksSchema }).strict();
const rowSchema = z.object({
  id: z.uuid(),
  question_id: z.uuid(),
  family_id: z.uuid(),
  revision: z.number().int().positive(),
  locale: z.enum(['ru', 'kk']),
  type: z.enum(['single', 'multi', 'matching']),
  public_body: z.unknown(),
  grading_body: z.unknown(),
  explanation: contextSchema.nullable(),
  context_snapshot: contextSchema.nullable(),
  content_hash: z.string().min(1).max(200),
  question_publications: z.object({ status: z.literal('approved') }).strict(),
  questions: z.object({
    topic_id: z.uuid(),
    topics: z.object({
      slug: z.string().min(1).max(160),
      subject_id: z.uuid(),
      subjects: z.object({ slug: z.string().min(1).max(160) }).strict(),
    }).strict(),
  }).strict(),
}).strict();

function copyBlocks(blocks: z.output<typeof blocksSchema>): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === 'table') return { type: 'table', columns: [...block.columns], rows: block.rows.map((row) => [...row]) };
    if (block.type === 'image') return { type: 'image', value: block.value };
    return block.type ? { type: block.type, value: block.value } : { value: block.value };
  });
}

function copyOptionalBlocks(blocks: z.output<typeof blocksSchema> | undefined): ContentBlock[] | undefined {
  return blocks ? copyBlocks(blocks) : undefined;
}

function versionBase(data: z.output<typeof rowSchema>) {
  return {
    approvalStatus: 'approved' as const,
    topicId: data.questions.topic_id,
    topicSlug: data.questions.topics.slug,
    subjectId: data.questions.topics.subject_id,
    subjectSlug: data.questions.topics.subjects.slug,
    version: {
      id: data.id,
      questionId: data.question_id,
      familyId: data.family_id,
      revision: data.revision,
      locale: data.locale,
      type: data.type,
      topicLabel: data.questions.topics.slug,
      explanation: data.explanation ? { blocks: copyBlocks(data.explanation.blocks) } satisfies Explanation : null,
      contextSnapshot: data.context_snapshot ? { blocks: copyBlocks(data.context_snapshot.blocks) } satisfies ContextContent : null,
      contentHash: data.content_hash,
    },
  };
}

function withBodies(
  data: z.output<typeof rowSchema>,
  publicBody: PublicQuestionBody,
  gradingBody: QuestionBody,
): ApprovedLearningVersion {
  const base = versionBase(data);
  return { ...base, version: { ...base.version, publicBody, gradingBody } };
}

function decodeApprovedLearningVersion(raw: unknown): ApprovedLearningVersion | null {
  const row = rowSchema.safeParse(raw);
  if (!row.success) return null;
  const { data } = row;
  if (data.type === 'single') {
    const publicBody = publicSingleSchema.safeParse(data.public_body);
    const gradingBody = gradingSingleSchema.safeParse(data.grading_body);
    if (!publicBody.success || !gradingBody.success) return null;
    const body: PublicQuestionBody = {
      stem: publicBody.data.stem,
      ...(copyOptionalBlocks(publicBody.data.stem_blocks) ? { stem_blocks: copyOptionalBlocks(publicBody.data.stem_blocks) } : {}),
      options: publicBody.data.options.map((option) => ({ id: option.id, content: option.content })),
    };
    const grading: QuestionBody = { ...body, correct: gradingBody.data.correct };
    return withBodies(data, body, grading);
  }
  if (data.type === 'multi') {
    const publicBody = publicSingleSchema.safeParse(data.public_body);
    const gradingBody = gradingMultiSchema.safeParse(data.grading_body);
    if (!publicBody.success || !gradingBody.success) return null;
    const body: PublicQuestionBody = {
      stem: publicBody.data.stem,
      ...(copyOptionalBlocks(publicBody.data.stem_blocks) ? { stem_blocks: copyOptionalBlocks(publicBody.data.stem_blocks) } : {}),
      options: publicBody.data.options.map((option) => ({ id: option.id, content: option.content })),
    };
    const grading: QuestionBody = { ...body, correct: [...gradingBody.data.correct] };
    return withBodies(data, body, grading);
  }
  const publicBody = publicMatchingSchema.safeParse(data.public_body);
  const gradingBody = gradingMatchingSchema.safeParse(data.grading_body);
  if (!publicBody.success || !gradingBody.success) return null;
  const body: PublicQuestionBody = {
    stem: publicBody.data.stem,
    ...(copyOptionalBlocks(publicBody.data.stem_blocks) ? { stem_blocks: copyOptionalBlocks(publicBody.data.stem_blocks) } : {}),
    left: publicBody.data.left.map((option) => ({ id: option.id, content: option.content })),
    right: [...publicBody.data.right],
  };
  const grading: QuestionBody = { ...body, correct: { ...gradingBody.data.correct } };
  return withBodies(data, body, grading);
}

/** Decodes immutable rows before selection; malformed content fails closed. */
export async function loadApprovedLearningVersions(
  client: LearningContentClient,
  locale: 'ru' | 'kk',
): Promise<ApprovedLearningVersion[] | { error: 'content-unavailable' | 'temporarily-unavailable' }> {
  const response = await client.readApprovedVersions(locale);
  if (response.error) return { error: 'temporarily-unavailable' };
  if (!Array.isArray(response.data)) return { error: 'content-unavailable' };
  const versions: ApprovedLearningVersion[] = [];
  for (const raw of response.data) {
    const version = decodeApprovedLearningVersion(raw);
    if (!version) return { error: 'content-unavailable' };
    versions.push(version);
  }
  return versions;
}

function isReceipt(value: unknown): value is Receipt {
  return isRecord(value)
    && typeof value.sessionId === 'string'
    && typeof value.acceptedAt === 'string'
    && typeof value.score === 'number'
    && typeof value.maxScore === 'number'
    && typeof value.correctCount === 'number'
    && typeof value.totalQuestions === 'number'
    && typeof value.xpAwarded === 'number'
    && value.integrityVersion === 1
    && value.scoringVersion === 'ent-v1';
}

function rpcError(value: unknown): CommitError | null {
  if (!isRecord(value) || typeof value.error !== 'string') return null;
  return knownErrors.has(value.error as CommitError) ? value.error as CommitError : null;
}

/** Strict transport adapter for the service-only, atomic start RPC. */
export async function startLearningRpc(
  client: LearningRpcClient,
  input: StartRpcInput,
): Promise<StartedLearningReferences | { error: CommitError }> {
  const response = await client.rpc('start_learning_v1', {
    actor_id: input.actorId,
    operation_id: input.operationId,
    payload_hash: input.payloadHash,
    plan: input.plan,
  });
  if (response.error) return { error: 'temporarily-unavailable' };
  if (isStartedReferences(response.data)) return response.data;
  const error = rpcError(response.data);
  if (error) return { error };
  return { error: 'temporarily-unavailable' };
}

/**
 * The only adapter allowed to call commit_learning_v1. The server service
 * passes a verified actor and server-grades every item before reaching here.
 */
export async function commitLearningRpc(
  client: LearningRpcClient,
  input: CommitRpcInput
): Promise<Receipt | { error: CommitError }> {
  const response = await client.rpc('commit_learning_v1', {
    actor_id: input.actorId,
    operation_id: input.operationId,
    payload_hash: input.payloadHash,
    session_id: input.sessionId,
    scoring_version: input.scoringVersion,
    graded_items: input.gradedItems.map((item) => ({
      itemId: item.itemId,
      questionVersionId: item.questionVersionId,
      answer: item.answer,
      points: item.points,
      maxPoints: item.maxPoints,
      timeSpentMs: item.timeSpentMs,
    })),
  });
  if (response.error) return { error: 'temporarily-unavailable' };
  if (isReceipt(response.data)) return response.data;
  const error = rpcError(response.data);
  if (error) return { error };
  return { error: 'temporarily-unavailable' };
}
