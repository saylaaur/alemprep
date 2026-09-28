import 'server-only';

import { getActor } from '@/lib/server/actor';
import { createAdminClient } from '@/lib/supabase/admin';
import { createLearningService } from './service';
import { createSupabaseLearningStateClient, loadLearningState, type LearningStateClient } from './repository';

export type LearningStateDependencies = {
  actorId: () => Promise<string | null>;
  state: LearningStateClient;
  now?: () => Date;
};

/** Server-only reload/retry state boundary; ownership is enforced twice. */
export function createLearningStateService(dependencies: LearningStateDependencies) {
  const service = createLearningService({
    actorId: dependencies.actorId,
    start: async () => ({ error: 'temporarily-unavailable' }),
    getState: async ({ actorId, sessionId }) => loadLearningState(dependencies.state, actorId, sessionId, dependencies.now?.()),
    loadIssuedSession: async () => null,
    commit: async () => ({ error: 'temporarily-unavailable' }),
  });
  return { getLearningState: service.getState };
}

/** Production factory; the service role is used only after server Auth succeeds. */
export function createProductionLearningStateService() {
  const admin = createAdminClient();
  return createLearningStateService({
    actorId: async () => (await getActor())?.id ?? null,
    state: createSupabaseLearningStateClient(admin),
    now: () => new Date(),
  });
}

export async function getLearningState(raw: unknown) {
  return createProductionLearningStateService().getLearningState(raw);
}
