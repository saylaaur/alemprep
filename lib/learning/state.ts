import 'server-only';

import { createLearningService } from './service';
import { loadLearningState, type LearningStateClient } from './repository';

export type LearningStateDependencies = {
  actorId: () => Promise<string | null>;
  state: LearningStateClient;
};

/** Server-only reload/retry state boundary; ownership is enforced twice. */
export function createLearningStateService(dependencies: LearningStateDependencies) {
  const service = createLearningService({
    actorId: dependencies.actorId,
    start: async () => ({ error: 'temporarily-unavailable' }),
    getState: async ({ actorId, sessionId }) => loadLearningState(dependencies.state, actorId, sessionId),
    loadIssuedSession: async () => null,
    commit: async () => ({ error: 'temporarily-unavailable' }),
  });
  return { getLearningState: service.getState };
}
