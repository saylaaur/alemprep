import 'server-only';

import { getActor } from '@/lib/server/actor';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  selectMockExamSessions,
  selectPairedAssessmentSession,
  selectPracticeSession,
  type ApprovedLearningVersion,
  type SelectedLearningSession,
} from '@/lib/content/learning-catalog';
import { DIAGNOSTIC_BLUEPRINT, EXAM_BLUEPRINT } from '@/lib/exam';
import { WEEKLY_BLUEPRINT } from '@/lib/weekly';
import type { QuestionType } from '@/types/db';
import type { LearningError, StartedLearning, StartInput } from './contracts';
import {
  createSupabaseLearningContentClient,
  createSupabaseLearningReplayClient,
  createSupabasePracticeHistoryClient,
  loadApprovedLearningVersions,
  loadRecentPracticeFamilies,
  loadStartReplay,
  startLearningRpc,
  type LearningContentClient,
  type LearningRpcClient,
} from './repository';
import { createLearningService, startPayloadHash } from './service';

type StartFailure = Exclude<LearningError, 'unauthenticated' | 'invalid-input'>;
type StartRequest = Omit<StartInput, 'operationId'>;

function blueprintTypes(blueprint: readonly { type: QuestionType }[]): QuestionType[] {
  return [...new Set(blueprint.map((part) => part.type))];
}

async function loadAssessmentSubject(
  content: LearningContentClient,
  locale: 'ru' | 'kk',
  subjectSlug: 'math' | 'physics' | 'informatics',
  blueprint: readonly { type: QuestionType }[],
): Promise<ApprovedLearningVersion[] | { error: StartFailure }> {
  return loadApprovedLearningVersions(content, locale, {
    subjectSlugs: [subjectSlug],
    types: blueprintTypes(blueprint),
  });
}

export type LearningStartDependencies = {
  actorId: () => Promise<string | null>;
  content: LearningContentClient;
  rpc: LearningRpcClient;
  now: () => Date;
  /** Families this pupil was already issued in a topic, most recent first. */
  recentPracticeFamilies?: (input: { actorId: string; topicId: string }) => Promise<string[]>;
  /** Injectable only to keep the bounded concurrent-replay test deterministic. */
  retryPause?: (milliseconds: number) => Promise<void>;
  /** Must read the server-owned receipt/session rows before new catalog selection. */
  findReplay: (input: {
    actorId: string;
    operationId: string;
    payloadHash: string;
  }) => Promise<StartedLearning | null | { error: StartFailure }>;
};

const concurrentReplayDelaysMs = [100, 250, 500, 1_000] as const;

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isFailure(value: unknown): value is { error: StartFailure } {
  return value !== null && typeof value === 'object' && 'error' in value;
}

async function selectSessions(
  content: LearningContentClient,
  request: StartRequest,
  selectionKey: string,
  now: Date,
  recentFamilies: (topicId: string) => Promise<string[]>,
): Promise<SelectedLearningSession[] | { error: StartFailure }> {
  let candidates: ApprovedLearningVersion[];
  if (request.topicSlug) {
    const result = await loadApprovedLearningVersions(content, request.locale, { topicSlug: request.topicSlug });
    if (isFailure(result)) return result;
    candidates = result;
  } else if (request.second) {
    const blueprint = request.mode === 'mock_exam'
      ? EXAM_BLUEPRINT
      : request.mode === 'diagnostic'
        ? DIAGNOSTIC_BLUEPRINT
        : WEEKLY_BLUEPRINT;
    const [math, second] = await Promise.all([
      loadAssessmentSubject(content, request.locale, 'math', blueprint),
      loadAssessmentSubject(content, request.locale, request.second, blueprint),
    ]);
    if (isFailure(math)) return math;
    if (isFailure(second)) return second;
    candidates = [...math, ...second];
  } else {
    return { error: 'temporarily-unavailable' };
  }

  if (request.mode === 'practice') {
    const topicId = candidates.find((entry) => entry.topicSlug === request.topicSlug)?.topicId;
    const recentFamilyIds = topicId ? await recentFamilies(topicId) : [];
    const selected = request.topicSlug ? selectPracticeSession({
      locale: request.locale, topicSlug: request.topicSlug, selectionKey, candidates, now, recentFamilyIds,
    }) : null;
    return selected ? [selected] : { error: 'content-unavailable' };
  }
  if (!request.second) return { error: 'temporarily-unavailable' };
  if (request.mode === 'mock_exam') {
    const selected = selectMockExamSessions({
      locale: request.locale,
      secondSubjectSlug: request.second,
      selectionKey,
      candidates,
      blueprint: EXAM_BLUEPRINT,
      now,
    });
    return selected ?? { error: 'content-unavailable' };
  }
  const selected = selectPairedAssessmentSession({
    locale: request.locale,
    mode: request.mode,
    secondSubjectSlug: request.second,
    selectionKey,
    candidates,
    blueprint: request.mode === 'diagnostic' ? DIAGNOSTIC_BLUEPRINT : WEEKLY_BLUEPRINT,
    now,
  });
  return selected ? [selected] : { error: 'content-unavailable' };
}

/**
 * Server-only start path. It checks a receipt first, then plans from approved
 * immutable content and calls the atomic RPC; the browser never supplies a
 * version, session plan, actor, score, or answer key.
 */
export function createLearningStartService(dependencies: LearningStartDependencies) {
  const service = createLearningService({
    actorId: dependencies.actorId,
    start: async ({ actorId, operationId, payloadHash, request }) => {
      const replay = await dependencies.findReplay({ actorId, operationId, payloadHash });
      if (isFailure(replay)) return replay;
      if (replay) return replay;

      const recentFamilies = async (topicId: string) => {
        if (!dependencies.recentPracticeFamilies) return [];
        try {
          return await dependencies.recentPracticeFamilies({ actorId, topicId });
        } catch {
          return [];
        }
      };
      const selected = await selectSessions(
        dependencies.content, request, `${actorId}:${operationId}`, dependencies.now(), recentFamilies,
      );
      if (isFailure(selected)) return selected;
      const issued = await startLearningRpc(dependencies.rpc, {
        actorId,
        operationId,
        payloadHash,
        plan: { sessions: selected.map((session) => session.plan) },
      });
      if (isFailure(issued)) {
        if (issued.error !== 'temporarily-unavailable') return issued;
        // A duplicate request can time out behind the RPC's per-operation DB
        // lock while the winner is still writing its receipt. Poll only that
        // receipt for a short, bounded window; never resample content or call
        // the start RPC a second time.
        for (const delay of concurrentReplayDelaysMs) {
          await (dependencies.retryPause ?? pause)(delay);
          const concurrentReplay = await dependencies.findReplay({ actorId, operationId, payloadHash });
          if (isFailure(concurrentReplay)) {
            if (concurrentReplay.error !== 'temporarily-unavailable') return concurrentReplay;
            continue;
          }
          if (concurrentReplay) return concurrentReplay;
        }
        return issued;
      }
      // Read the issued immutable rows even on the winner path. The RPC can
      // replay a concurrent winner with an identical expiry but different
      // version IDs; only the stored session is authoritative for the public
      // DTO.
      const replayedIssue = await dependencies.findReplay({ actorId, operationId, payloadHash });
      if (isFailure(replayedIssue)) return replayedIssue;
      return replayedIssue ?? { error: 'temporarily-unavailable' };
    },
    getState: async () => ({ error: 'temporarily-unavailable' }),
    loadIssuedSession: async () => null,
    commit: async () => ({ error: 'temporarily-unavailable' }),
  });
  return { startLearning: service.start };
}

/** Production factory with Auth-derived actor and service-only database access. */
export function createProductionLearningStartService() {
  const admin = createAdminClient();
  const replay = createSupabaseLearningReplayClient(admin);
  const history = createSupabasePracticeHistoryClient(admin);
  return createLearningStartService({
    actorId: async () => (await getActor())?.id ?? null,
    content: createSupabaseLearningContentClient(admin),
    rpc: admin,
    now: () => new Date(),
    recentPracticeFamilies: ({ actorId, topicId }) => loadRecentPracticeFamilies(history, actorId, topicId),
    findReplay: ({ actorId, operationId, payloadHash }) => loadStartReplay(replay, actorId, operationId, payloadHash),
  });
}

export async function startLearning(raw: unknown) {
  return createProductionLearningStartService().startLearning(raw);
}

/** Exposed for repository tests that assert canonical replay lookup parameters. */
export function replayHash(input: StartInput): string {
  return startPayloadHash(input);
}
