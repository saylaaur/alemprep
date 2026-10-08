import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ApprovedLearningVersion, LearningSessionPlan } from '@/lib/content/learning-catalog';
import { toPublicQuestion } from '@/lib/content/public-question';
import type { ContentBlock, ContextContent, Explanation, QuestionBody } from '@/types/db';
import type { QuestionType } from '@/types/db';
import type { PublicQuestionBody } from '@/lib/content/versions';
import type { Answer, LearningError, LearningReview, LearningState, PublicSessionItem, Receipt, StartedLearning, StartedSession } from './contracts';
import type { IssuedLearningSession, ServerGradedItem } from './service';
import { gradeVersionAnswer } from './grading';
import { blocksSchema, publicSingleSchema, publicMatchingSchema, gradingSingleSchema, gradingMultiSchema, gradingMatchingSchema, contextSchema } from '@/lib/content/immutable-content-schemas';

type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };
type StartRpcError = Exclude<LearningError, 'unauthenticated' | 'invalid-input'>;
type CommitError = Exclude<LearningError, 'unauthenticated'>;

export type LearningRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResponse>;
};

type ContentResponse = { data: unknown; error: unknown | null };
export type ApprovedVersionSelection = {
  topicSlug?: string;
  subjectSlugs?: readonly string[];
  type?: QuestionType;
  /** Each type gets its own bound so early single-choice rows cannot hide it. */
  types?: readonly QuestionType[];
};

type LearningCatalogResult = ApprovedLearningVersion[] | { error: 'content-unavailable' | 'temporarily-unavailable' };

function isCatalogFailure(value: LearningCatalogResult): value is { error: 'content-unavailable' | 'temporarily-unavailable' } {
  return 'error' in value;
}

/** Narrow read port so tests can exercise decoders without a live Supabase client. */
export type LearningContentClient = {
  readApprovedVersions: (locale: 'ru' | 'kk', selection: ApprovedVersionSelection) => Promise<ContentResponse>;
};

export type LearningStateClient = {
  readSession: (actorId: string, sessionId: string) => Promise<ContentResponse>;
};

export type LearningReviewClient = {
  readSession: (actorId: string, sessionId: string) => Promise<ContentResponse>;
};

export type LearningReplayClient = LearningStateClient & {
  readStartReceipt: (actorId: string, operationId: string) => Promise<ContentResponse>;
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

const knownStartErrors = new Set<StartRpcError>([
  'forbidden', 'not-found', 'expired', 'already-submitted',
  'operation-conflict', 'content-unavailable', 'rate-limited', 'temporarily-unavailable',
]);
const knownCommitErrors = new Set<CommitError>([...knownStartErrors, 'invalid-input']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modes = new Set<StartedSessionReference['mode']>(['practice', 'mock_exam', 'diagnostic', 'weekly']);

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isLearningMode(value: unknown): value is StartedSessionReference['mode'] {
  return typeof value === 'string' && modes.has(value as StartedSessionReference['mode']);
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isStartedReferences(value: unknown): value is StartedLearningReferences {
  if (!isRecord(value) || !Array.isArray(value.sessions) || value.sessions.length < 1 || value.sessions.length > 2) {
    return false;
  }
  return value.sessions.every((session) => isRecord(session)
    && isUuid(session.id)
    && isLearningMode(session.mode)
    && typeof session.expiresAt === 'string' && !Number.isNaN(Date.parse(session.expiresAt))
    && Array.isArray(session.itemIds) && session.itemIds.length > 0 && session.itemIds.every(isUuid));
}

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
  question_publications: z.object({ status: z.enum(['approved', 'quarantined']) }).strict(),
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

function hasSameOptionIds(
  publicOptions: readonly { id: string }[],
  gradingOptions: readonly { id: string }[],
): boolean {
  if (publicOptions.length !== gradingOptions.length) return false;
  const publicIds = new Set(publicOptions.map((option) => option.id));
  return publicIds.size === publicOptions.length
    && gradingOptions.every((option) => publicIds.has(option.id))
    && new Set(gradingOptions.map((option) => option.id)).size === gradingOptions.length;
}

function isCompleteMatchingGrading(
  publicBody: z.output<typeof publicMatchingSchema>,
  gradingBody: z.output<typeof gradingMatchingSchema>,
): boolean {
  if (!hasSameOptionIds(publicBody.left, gradingBody.left)
    || publicBody.right.length !== gradingBody.right.length
    || new Set(publicBody.right).size !== publicBody.right.length
    || new Set(gradingBody.right).size !== gradingBody.right.length
    || gradingBody.right.some((right) => !publicBody.right.includes(right))) {
    return false;
  }
  const leftIds = new Set(publicBody.left.map((option) => option.id));
  const pairs = Object.entries(gradingBody.correct);
  return pairs.length === leftIds.size
    && pairs.every(([left, right]) => leftIds.has(left) && publicBody.right.includes(right));
}

function versionBase(data: z.output<typeof rowSchema>) {
  return {
    approvalStatus: data.question_publications.status,
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

export function decodeImmutableLearningVersion(raw: unknown): ApprovedLearningVersion | null {
  const row = rowSchema.safeParse(raw);
  if (!row.success) return null;
  const { data } = row;
  if (data.type === 'single') {
    const publicBody = publicSingleSchema.safeParse(data.public_body);
    const gradingBody = gradingSingleSchema.safeParse(data.grading_body);
    if (!publicBody.success || !gradingBody.success
      || !hasSameOptionIds(publicBody.data.options, gradingBody.data.options)
      || !publicBody.data.options.some((option) => option.id === gradingBody.data.correct)) return null;
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
    if (!publicBody.success || !gradingBody.success
      || !hasSameOptionIds(publicBody.data.options, gradingBody.data.options)
      || new Set(gradingBody.data.correct).size !== gradingBody.data.correct.length
      || gradingBody.data.correct.some((correct) => !publicBody.data.options.some((option) => option.id === correct))) return null;
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
  if (!publicBody.success || !gradingBody.success || !isCompleteMatchingGrading(publicBody.data, gradingBody.data)) return null;
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
  selection: ApprovedVersionSelection,
): Promise<LearningCatalogResult> {
  if (selection.types && selection.types.length > 0) {
    const { types, ...baseSelection } = selection;
    const results = await Promise.all(types.map((type) => loadApprovedLearningVersions(client, locale, {
      ...baseSelection,
      type,
    })));
    const versions: ApprovedLearningVersion[] = [];
    for (const result of results) {
      if (isCatalogFailure(result)) return result;
      versions.push(...result);
    }
    return versions;
  }
  const response = await client.readApprovedVersions(locale, selection);
  if (response.error) return { error: 'temporarily-unavailable' };
  if (!Array.isArray(response.data)) return { error: 'content-unavailable' };
  const versions: ApprovedLearningVersion[] = [];
  for (const raw of response.data) {
    const version = decodeImmutableLearningVersion(raw);
    if (!version || version.approvalStatus !== 'approved') return { error: 'content-unavailable' };
    versions.push(version);
  }
  return versions;
}

const approvedVersionSelect = `
  id, question_id, family_id, revision, locale, type, public_body, grading_body,
  explanation, context_snapshot, content_hash,
  question_publications!inner(status),
  questions!inner(topic_id, topics!inner(slug, subject_id, subjects!inner(slug)))
`;

/** Production implementation of the bounded immutable catalog read. */
export function createSupabaseLearningContentClient(client: SupabaseClient): LearningContentClient {
  return {
    async readApprovedVersions(locale, selection) {
      let query = client
        .from('question_versions')
        .select(approvedVersionSelect)
        .eq('locale', locale)
        .eq('question_publications.status', 'approved')
        .order('id', { ascending: true })
        .limit(160);
      if (selection.topicSlug) {
        query = query.eq('questions.topics.slug', selection.topicSlug);
      } else if (selection.subjectSlugs && selection.subjectSlugs.length > 0) {
        query = query.in('questions.topics.subjects.slug', [...selection.subjectSlugs]);
      }
      if (selection.type) query = query.eq('type', selection.type);
      const { data, error } = await query;
      return { data, error };
    },
  };
}

function isReceipt(value: unknown): value is Receipt {
  if (!isRecord(value)) return false;
  const score = value.score;
  const maxScore = value.maxScore;
  const correctCount = value.correctCount;
  const totalQuestions = value.totalQuestions;
  const xpAwarded = value.xpAwarded;
  return isRecord(value)
    && isUuid(value.sessionId)
    && typeof value.acceptedAt === 'string' && !Number.isNaN(Date.parse(value.acceptedAt))
    && isBoundedInteger(score, 0, 160)
    && isBoundedInteger(maxScore, 0, 160)
    && score <= maxScore
    && isBoundedInteger(correctCount, 0, 80)
    && isBoundedInteger(totalQuestions, 1, 80)
    && correctCount <= totalQuestions
    && isBoundedInteger(xpAwarded, 0, 300)
    && value.integrityVersion === 1
    && value.scoringVersion === 'ent-v1';
}

function decodeIssuedSession(raw: unknown, actorId: string, sessionId: string): StartedSession | { error: 'not-found' | 'temporarily-unavailable' } {
  if (!isRecord(raw) || raw.id !== sessionId || raw.user_id !== actorId) return { error: 'not-found' };
  if (!isLearningMode(raw.mode)
    || typeof raw.expires_at !== 'string' || Number.isNaN(Date.parse(raw.expires_at))
    || !Array.isArray(raw.session_items) || raw.session_items.length < 1 || raw.session_items.length > 80) {
    return { error: 'temporarily-unavailable' };
  }
  const itemIds = new Set<string>();
  const positions = new Set<number>();
  const items: PublicSessionItem[] = [];
  for (const rawItem of raw.session_items) {
    if (!isRecord(rawItem)) return { error: 'temporarily-unavailable' };
    const itemId = rawItem.id;
    const position = rawItem.position;
    if (!isUuid(itemId) || !isBoundedInteger(position, 0, 79)
      || itemIds.has(itemId) || positions.has(position)) {
      return { error: 'temporarily-unavailable' };
    }
    const version = decodeImmutableLearningVersion(rawItem.question_versions);
    if (!version) return { error: 'temporarily-unavailable' };
    itemIds.add(itemId);
    positions.add(position);
    items.push({ id: itemId, position, question: toPublicQuestion(version.version) });
  }
  items.sort((left, right) => left.position - right.position);
  if (items.some((item, index) => item.position !== index)) return { error: 'temporarily-unavailable' };
  return { id: sessionId, mode: raw.mode, expiresAt: raw.expires_at, items };
}

/** Decodes the owner-scoped immutable versions used only by server grading. */
function decodeIssuedLearningSession(
  raw: unknown,
  actorId: string,
  sessionId: string,
): IssuedLearningSession | { error: 'not-found' | 'temporarily-unavailable' } {
  if (!isRecord(raw) || raw.id !== sessionId || raw.user_id !== actorId) return { error: 'not-found' };
  if (raw.scoring_version !== 'ent-v1' || !Array.isArray(raw.session_items)
    || raw.session_items.length < 1 || raw.session_items.length > 80) {
    return { error: 'temporarily-unavailable' };
  }
  const itemIds = new Set<string>();
  const positions = new Set<number>();
  const items: { id: string; position: number; version: IssuedLearningSession['items'][number]['version'] }[] = [];
  for (const rawItem of raw.session_items) {
    if (!isRecord(rawItem) || !isUuid(rawItem.id) || !isBoundedInteger(rawItem.position, 0, 79)
      || itemIds.has(rawItem.id) || positions.has(rawItem.position)) {
      return { error: 'temporarily-unavailable' };
    }
    const version = decodeImmutableLearningVersion(rawItem.question_versions);
    if (!version) return { error: 'temporarily-unavailable' };
    itemIds.add(rawItem.id);
    positions.add(rawItem.position);
    items.push({ id: rawItem.id, position: rawItem.position, version: version.version });
  }
  items.sort((left, right) => left.position - right.position);
  if (items.some((item, index) => item.position !== index)) return { error: 'temporarily-unavailable' };
  return {
    id: sessionId,
    scoringVersion: 'ent-v1',
    items: items.map(({ id, version }) => ({ id, version })),
  };
}

function decodeLearningState(
  raw: unknown,
  actorId: string,
  sessionId: string,
  now: Date,
): LearningState | { error: 'not-found' | 'temporarily-unavailable' } {
  if (!isRecord(raw) || raw.id !== sessionId || raw.user_id !== actorId) return { error: 'not-found' };
  if (raw.status === 'submitted') {
    return isReceipt(raw.receipt) && raw.receipt.sessionId === sessionId
      ? { status: 'submitted', receipt: raw.receipt }
      : { error: 'temporarily-unavailable' };
  }
  if (raw.status === 'expired' || raw.status === 'cancelled') {
    return { status: raw.status, sessionId };
  }
  if (raw.status !== 'active') return { error: 'temporarily-unavailable' };
  if (typeof raw.expires_at !== 'string' || Number.isNaN(Date.parse(raw.expires_at))) {
    return { error: 'temporarily-unavailable' };
  }
  if (new Date(raw.expires_at).getTime() <= now.getTime()) return { status: 'expired', sessionId };
  const session = decodeIssuedSession(raw, actorId, sessionId);
  return 'error' in session ? session : { status: 'active', session };
}

/** Owner-scoped state reader used for reload/retry recovery. */
export async function loadLearningState(
  client: LearningStateClient,
  actorId: string,
  sessionId: string,
  now = new Date(),
): Promise<LearningState | { error: 'not-found' | 'temporarily-unavailable' }> {
  const response = await client.readSession(actorId, sessionId);
  if (response.error) return { error: 'temporarily-unavailable' };
  if (response.data === null) return { error: 'not-found' };
  return decodeLearningState(response.data, actorId, sessionId, now);
}

/** Loads exactly the immutable rows issued to an owner for server-side grading. */
export async function loadIssuedLearningSession(
  client: LearningStateClient,
  actorId: string,
  sessionId: string,
): Promise<IssuedLearningSession | null | { error: 'temporarily-unavailable' }> {
  const response = await client.readSession(actorId, sessionId);
  if (response.error) return { error: 'temporarily-unavailable' };
  if (response.data === null) return null;
  const issued = decodeIssuedLearningSession(response.data, actorId, sessionId);
  if ('error' in issued) return issued.error === 'not-found' ? null : { error: 'temporarily-unavailable' };
  return issued;
}

function decodeStoredAnswer(value: unknown): Answer | undefined {
  if (value === null || typeof value === 'string') return value;
  if (Array.isArray(value) && value.length <= 10 && value.every((entry) => typeof entry === 'string')) {
    return [...value];
  }
  if (isRecord(value) && Object.keys(value).length <= 10
    && Object.entries(value).every(([key, entry]) => key !== '__proto__' && key !== 'prototype' && key !== 'constructor'
      && typeof entry === 'string')) {
    return { ...value } as Record<string, string>;
  }
  return undefined;
}

/** Reveals grading information only after an owner has a strict submitted receipt. */
export function decodeLearningReview(
  raw: unknown,
  actorId: string,
  sessionId: string,
): LearningReview | { error: 'not-found' | 'temporarily-unavailable' } {
  if (!isRecord(raw) || raw.id !== sessionId || raw.user_id !== actorId || raw.status !== 'submitted') {
    return { error: 'not-found' };
  }
  if (!isReceipt(raw.receipt) || raw.receipt.sessionId !== sessionId
    || !Array.isArray(raw.session_items) || raw.session_items.length < 1 || raw.session_items.length > 80) {
    return { error: 'temporarily-unavailable' };
  }
  const itemIds = new Set<string>();
  const positions = new Set<number>();
  const items: (LearningReview['items'][number] & { position: number })[] = [];
  for (const rawItem of raw.session_items) {
    if (!isRecord(rawItem) || !isUuid(rawItem.id) || !isBoundedInteger(rawItem.position, 0, 79)
      || itemIds.has(rawItem.id) || positions.has(rawItem.position)
      || !Array.isArray(rawItem.attempts) || rawItem.attempts.length !== 1 || !isRecord(rawItem.attempts[0])) {
      return { error: 'temporarily-unavailable' };
    }
    const version = decodeImmutableLearningVersion(rawItem.question_versions);
    const attempt = rawItem.attempts[0];
    const answer = decodeStoredAnswer(attempt.given_answer);
    if (!version || answer === undefined || attempt.integrity_version !== 1
      || !isBoundedInteger(attempt.points, 0, 2) || !isBoundedInteger(attempt.max_points, 1, 2)) {
      return { error: 'temporarily-unavailable' };
    }
    let grade: { points: number; maxPoints: number };
    try {
      grade = gradeVersionAnswer(version.version, answer);
    } catch {
      return { error: 'temporarily-unavailable' };
    }
    if (attempt.points !== grade.points || attempt.max_points !== grade.maxPoints) {
      return { error: 'temporarily-unavailable' };
    }
    itemIds.add(rawItem.id);
    positions.add(rawItem.position);
    items.push({
      itemId: rawItem.id,
      position: rawItem.position,
      answer,
      points: grade.points,
      maxPoints: grade.maxPoints,
      explanation: version.version.explanation,
      gradingBody: version.version.gradingBody,
    });
  }
  items.sort((left, right) => left.position - right.position);
  if (items.some((item, index) => item.position !== index)) return { error: 'temporarily-unavailable' };
  const score = items.reduce((sum, item) => sum + item.points, 0);
  const maxScore = items.reduce((sum, item) => sum + item.maxPoints, 0);
  const correctCount = items.filter((item) => item.points === item.maxPoints).length;
  if (raw.receipt.totalQuestions !== items.length || raw.receipt.score !== score
    || raw.receipt.maxScore !== maxScore || raw.receipt.correctCount !== correctCount) {
    return { error: 'temporarily-unavailable' };
  }
  return {
    receipt: raw.receipt,
    items: items.map((item) => ({
      itemId: item.itemId,
      answer: item.answer,
      points: item.points,
      maxPoints: item.maxPoints,
      explanation: item.explanation,
      gradingBody: item.gradingBody,
    })),
  };
}

/** Owner-scoped review loader. Active, expired and foreign sessions look absent. */
export async function loadLearningReview(
  client: LearningReviewClient,
  actorId: string,
  sessionId: string,
): Promise<LearningReview | { error: 'not-found' | 'temporarily-unavailable' }> {
  const response = await client.readSession(actorId, sessionId);
  if (response.error) return { error: 'temporarily-unavailable' };
  if (response.data === null) return { error: 'not-found' };
  return decodeLearningReview(response.data, actorId, sessionId);
}

/**
 * Restores an existing start result before planning new content. The immutable
 * session rows remain readable for historical accepted recovery. Active public
 * replay uses the same access guard as reload, and never resamples on denial.
 */
export async function loadStartReplay(
  client: LearningReplayClient,
  actorId: string,
  operationId: string,
  payloadHash: string,
): Promise<StartedLearning | null | { error: 'operation-conflict' | 'temporarily-unavailable' }> {
  const receiptResponse = await client.readStartReceipt(actorId, operationId);
  if (receiptResponse.error) return { error: 'temporarily-unavailable' };
  if (receiptResponse.data === null) return null;
  if (!isRecord(receiptResponse.data)
    || receiptResponse.data.kind !== 'learning.start'
    || typeof receiptResponse.data.payload_hash !== 'string') {
    return { error: 'temporarily-unavailable' };
  }
  if (receiptResponse.data.payload_hash !== payloadHash) return { error: 'operation-conflict' };
  if (!isStartedReferences(receiptResponse.data.result)) return { error: 'temporarily-unavailable' };
  const references = receiptResponse.data.result.sessions;
  const responses = await Promise.all(references.map((reference) => client.readSession(actorId, reference.id)));
  const sessions: StartedSession[] = [];
  for (const [index, response] of responses.entries()) {
    const reference = references[index]!;
    if (response.error || response.data === null) return { error: 'temporarily-unavailable' };
    const session = decodeIssuedSession(response.data, actorId, reference.id);
    if ('error' in session
      || session.mode !== reference.mode
      || new Date(session.expiresAt).getTime() !== new Date(reference.expiresAt).getTime()
      || session.items.length !== reference.itemIds.length
      || session.items.some((item, itemIndex) => item.id !== reference.itemIds[itemIndex])) {
      return { error: 'temporarily-unavailable' };
    }
    sessions.push(session);
  }
  return { sessions };
}

const learningStateSelect = `
  id, user_id, status, mode, expires_at, receipt, scoring_version,
  session_items!inner(
    id, position,
    question_versions!inner(
      id, question_id, family_id, revision, locale, type, public_body, grading_body,
      explanation, context_snapshot, content_hash,
      question_publications!inner(status),
      questions!inner(topic_id, topics!inner(slug, subject_id, subjects!inner(slug)))
    )
  )
`;

const learningReviewSelect = `
  id, user_id, status, receipt,
  session_items!inner(
    id, position,
    attempts!inner(given_answer, points, max_points, integrity_version),
    question_versions!inner(
      id, question_id, family_id, revision, locale, type, public_body, grading_body,
      explanation, context_snapshot, content_hash,
      question_publications!inner(status),
      questions!inner(topic_id, topics!inner(slug, subject_id, subjects!inner(slug)))
    )
  )
`;

export type PracticeHistoryClient = {
  readRecentPracticeSessions: (actorId: string, topicId: string) => Promise<ContentResponse>;
};

const practiceHistorySchema = z.array(z.object({
  session_items: z.array(z.object({
    question_versions: z.object({ family_id: z.string() }).nullable(),
  })),
}));

/**
 * Families issued to this pupil in recent practice sessions of one topic, most
 * recent first. Only steers which task comes next, so any read or decode
 * failure returns an empty history and practice starts as before.
 */
export async function loadRecentPracticeFamilies(
  client: PracticeHistoryClient,
  actorId: string,
  topicId: string,
): Promise<string[]> {
  try {
    const response = await client.readRecentPracticeSessions(actorId, topicId);
    if (response.error) return [];
    const parsed = practiceHistorySchema.safeParse(response.data);
    if (!parsed.success) return [];
    return parsed.data.flatMap((session) => session.session_items
      .map((item) => item.question_versions?.family_id)
      .filter((familyId): familyId is string => typeof familyId === 'string'));
  } catch {
    return [];
  }
}

/** Bounded owner-scoped read of recent practice sessions in one topic. */
export function createSupabasePracticeHistoryClient(client: SupabaseClient): PracticeHistoryClient {
  return {
    async readRecentPracticeSessions(actorId, topicId) {
      const { data, error } = await client
        .from('sessions')
        .select('session_items(question_versions(family_id))')
        .eq('user_id', actorId)
        .eq('topic_id', topicId)
        .eq('mode', 'practice')
        .eq('integrity_version', 1)
        .order('started_at', { ascending: false })
        .limit(200);
      return { data, error };
    },
  };
}

/** Production owner-scoped reader for reload/retry state. */
export function createSupabaseLearningStateClient(
  client: SupabaseClient,
  purpose: 'issued' | 'reload' = 'issued',
): LearningStateClient {
  return {
    async readSession(actorId, sessionId) {
      const readOwned = () => client
        .from('sessions')
        .select(learningStateSelect)
        .eq('id', sessionId)
        .eq('user_id', actorId)
        .eq('integrity_version', 1)
        .maybeSingle();
      const { data, error } = await readOwned();
      if (!error && purpose === 'reload' && isRecord(data) && data.status === 'active'
        && typeof data.expires_at === 'string' && Date.parse(data.expires_at) > Date.now()) {
        const access = await client.rpc('learning_active_session_access_v1', {
          actor_id: actorId, session_id: sessionId,
        });
        if (access.error) return { data: null, error: access.error };
        if (access.data !== true) {
          // A concurrent submit/expiry can win between the read and guard.
          // Recover its terminal state, but never return denied active content.
          const recovered = await readOwned();
          return { data: isRecord(recovered.data) && recovered.data.status !== 'active' ? recovered.data : null,
            error: recovered.error };
        }
      }
      return { data, error };
    },
  };
}

/** Production owner-scoped review reader; submitted status is enforced in SQL and decoder. */
export function createSupabaseLearningReviewClient(client: SupabaseClient): LearningReviewClient {
  return {
    async readSession(actorId, sessionId) {
      const { data, error } = await client
        .from('sessions')
        .select(learningReviewSelect)
        .eq('id', sessionId)
        .eq('user_id', actorId)
        .eq('integrity_version', 1)
        .eq('status', 'submitted')
        .maybeSingle();
      return { data, error };
    },
  };
}

/** Production receipt + issued-session reader for idempotent start replay. */
export function createSupabaseLearningReplayClient(client: SupabaseClient): LearningReplayClient {
  const state = createSupabaseLearningStateClient(client, 'reload');
  return {
    ...state,
    async readStartReceipt(actorId, operationId) {
      const { data, error } = await client
        .from('operation_receipts')
        .select('kind, payload_hash, result')
        .eq('actor_id', actorId)
        .eq('operation_id', operationId)
        .maybeSingle();
      return { data, error };
    },
  };
}

function rpcError<T extends LearningError>(value: unknown, knownErrors: ReadonlySet<T>): T | null {
  if (!isRecord(value) || typeof value.error !== 'string') return null;
  return knownErrors.has(value.error as T) ? value.error as T : null;
}

/** Maps only the explicit SQLSTATE/domain-code pairs raised by the trusted RPC. */
function commitTransportError(error: RpcResponse['error']): CommitError {
  if (!error || typeof error.message !== 'string' || typeof error.code !== 'string') {
    return 'temporarily-unavailable';
  }
  if (error.code === '22023' && knownCommitErrors.has(error.message as CommitError)) {
    return error.message as CommitError;
  }
  if (error.code === '42501' && error.message === 'forbidden') return 'forbidden';
  return 'temporarily-unavailable';
}

/** Maps only the explicit SQLSTATE/domain-code pairs raised by the start RPC. */
function startTransportError(error: RpcResponse['error']): StartRpcError {
  if (!error || typeof error.message !== 'string' || typeof error.code !== 'string') {
    return 'temporarily-unavailable';
  }
  if (error.code === '22023' && knownStartErrors.has(error.message as StartRpcError)) {
    return error.message as StartRpcError;
  }
  if (error.code === '42501' && error.message === 'forbidden') return 'forbidden';
  return 'temporarily-unavailable';
}

/** Strict transport adapter for the service-only, atomic start RPC. */
export async function startLearningRpc(
  client: LearningRpcClient,
  input: StartRpcInput,
): Promise<StartedLearningReferences | { error: StartRpcError }> {
  const response = await client.rpc('start_learning_v1', {
    actor_id: input.actorId,
    operation_id: input.operationId,
    payload_hash: input.payloadHash,
    plan: input.plan,
  });
  if (response.error) return { error: startTransportError(response.error) };
  if (isStartedReferences(response.data)) return response.data;
  const error = rpcError(response.data, knownStartErrors);
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
  if (response.error) return { error: commitTransportError(response.error) };
  if (isReceipt(response.data)) return response.data;
  const error = rpcError(response.data, knownCommitErrors);
  if (error) return { error };
  return { error: 'temporarily-unavailable' };
}
