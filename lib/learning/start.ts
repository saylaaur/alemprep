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
import type { LearningError, StartedLearning, StartInput } from './contracts';
import {
  createSupabaseLearningContentClient,
  createSupabaseLearningReplayClient,
  loadApprovedLearningVersions,
  loadStartReplay,
  startLearningRpc,
  type LearningContentClient,
  type LearningRpcClient,
} from './repository';
import { createLearningService, materializeStartedLearning, startPayloadHash } from './service';

type StartFailure = Exclude<LearningError, 'unauthenticated' | 'invalid-input'>;
type StartRequest = Omit<StartInput, 'operationId'>;

export type LearningStartDependencies = {
  actorId: () => Promise<string | null>;
  content: LearningContentClient;
  rpc: LearningRpcClient;
  now: () => Date;
  /** Must read the server-owned receipt/session rows before new catalog selection. */
  findReplay: (input: {
    actorId: string;
    operationId: string;
    payloadHash: string;
  }) => Promise<StartedLearning | null | { error: StartFailure }>;
};

function isFailure(value: unknown): value is { error: StartFailure } {
  return value !== null && typeof value === 'object' && 'error' in value;
}

async function selectSessions(
  content: LearningContentClient,
  request: StartRequest,
  now: Date,
): Promise<SelectedLearningSession[] | { error: StartFailure }> {
  let candidates: ApprovedLearningVersion[];
  if (request.topicSlug) {
    const result = await loadApprovedLearningVersions(content, request.locale, { topicSlug: request.topicSlug });
    if (isFailure(result)) return result;
    candidates = result;
  } else if (request.second) {
    const [math, second] = await Promise.all([
      loadApprovedLearningVersions(content, request.locale, { subjectSlugs: ['math'] }),
      loadApprovedLearningVersions(content, request.locale, { subjectSlugs: [request.second] }),
    ]);
    if (isFailure(math)) return math;
    if (isFailure(second)) return second;
    candidates = [...math, ...second];
  } else {
    return { error: 'temporarily-unavailable' };
  }

  if (request.mode === 'practice') {
    const selected = request.topicSlug ? selectPracticeSession({
      locale: request.locale, topicSlug: request.topicSlug, candidates, now,
    }) : null;
    return selected ? [selected] : { error: 'content-unavailable' };
  }
  if (!request.second) return { error: 'temporarily-unavailable' };
  if (request.mode === 'mock_exam') {
    const selected = selectMockExamSessions({
      locale: request.locale,
      secondSubjectSlug: request.second,
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

      const selected = await selectSessions(dependencies.content, request, dependencies.now());
      if (isFailure(selected)) return selected;
      const issued = await startLearningRpc(dependencies.rpc, {
        actorId,
        operationId,
        payloadHash,
        plan: { sessions: selected.map((session) => session.plan) },
      });
      if (isFailure(issued)) return issued;
      return materializeStartedLearning({ selected, issued }) ?? { error: 'temporarily-unavailable' };
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
  return createLearningStartService({
    actorId: async () => (await getActor())?.id ?? null,
    content: createSupabaseLearningContentClient(admin),
    rpc: admin,
    now: () => new Date(),
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
