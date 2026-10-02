import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { getActor } from '@/lib/server/actor';
import type { LearningError, LearningState, Result } from '@/lib/learning/contracts';
import {
  createSupabaseLearningStateClient,
  loadLearningState,
  type LearningRpcClient,
  type LearningStateClient,
} from '@/lib/learning/repository';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAssignedStartInput, type AssignedStart } from './contracts';
import { startAssignedLearningRpc } from './repository';

type AssignedStartFailure = Exclude<LearningError, 'unauthenticated' | 'invalid-input'>;

export type AssignedPracticeDependencies = {
  actorId: () => Promise<string | null>;
  rpc: LearningRpcClient;
  state: LearningStateClient;
  now?: () => Date;
};

function failure(error: LearningError): Result<never> {
  return { ok: false, error, requestId: randomUUID() };
}

function payloadHash(assignmentId: string): string {
  return createHash('sha256').update(JSON.stringify({ kind: 'pilot.assigned.start', assignmentId })).digest('hex');
}

function isFailure(value: LearningState | { error: AssignedStartFailure }): value is { error: AssignedStartFailure } {
  return 'error' in value;
}

/**
 * Starts only server-selected work for a fixed assignment. The browser cannot
 * supply a pupil, school, locale, topic, version or grading payload.
 */
export function createAssignedPracticeService(dependencies: AssignedPracticeDependencies) {
  return {
    async startAssignedPractice(raw: unknown): Promise<Result<AssignedStart>> {
      const input = parseAssignedStartInput(raw);
      if (!input) return failure('invalid-input');
      const actorId = await dependencies.actorId();
      if (!actorId) return failure('unauthenticated');

      const started = await startAssignedLearningRpc(dependencies.rpc, {
        actorId,
        operationId: input.operationId,
        payloadHash: payloadHash(input.assignmentId),
        assignmentId: input.assignmentId,
      });
      if ('error' in started) return failure(started.error);
      if (started.status === 'completed') {
        return { ok: true, value: started };
      }

      const state = await loadLearningState(dependencies.state, actorId, started.sessionId, dependencies.now?.());
      if (isFailure(state) || state.status !== 'active' || state.session.id !== started.sessionId) {
        return failure(isFailure(state) ? state.error : 'temporarily-unavailable');
      }
      return {
        ok: true,
        value: {
          status: 'active', learning: { sessions: [state.session] },
          totalSteps: started.totalSteps, completedSteps: started.completedSteps,
        },
      };
    },
  };
}

/** Production entry point: Auth owns actor identity; DB access stays server-only. */
export function createProductionAssignedPracticeService() {
  const admin = createAdminClient();
  return createAssignedPracticeService({
    actorId: async () => (await getActor())?.id ?? null,
    rpc: admin,
    state: createSupabaseLearningStateClient(admin),
    now: () => new Date(),
  });
}

export async function startAssignedPractice(raw: unknown): Promise<Result<AssignedStart>> {
  return createProductionAssignedPracticeService().startAssignedPractice(raw);
}
