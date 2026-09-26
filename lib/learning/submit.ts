import 'server-only';

import { getActor } from '@/lib/server/actor';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  commitLearningRpc,
  createSupabaseLearningStateClient,
  loadIssuedLearningSession,
  type LearningRpcClient,
  type LearningStateClient,
} from './repository';
import { createLearningService } from './service';

export type LearningSubmitDependencies = {
  actorId: () => Promise<string | null>;
  issued: LearningStateClient;
  rpc: LearningRpcClient;
};

/** Server-only submit boundary: the browser supplies answers, never grades. */
export function createLearningSubmitService(dependencies: LearningSubmitDependencies) {
  const service = createLearningService({
    actorId: dependencies.actorId,
    start: async () => ({ error: 'temporarily-unavailable' }),
    getState: async () => ({ error: 'temporarily-unavailable' }),
    loadIssuedSession: (actorId, sessionId) => loadIssuedLearningSession(dependencies.issued, actorId, sessionId),
    commit: (input) => commitLearningRpc(dependencies.rpc, input),
  });
  return { submitLearning: service.submit };
}

/** Production factory with Auth-derived actor and a service-only commit client. */
export function createProductionLearningSubmitService() {
  const admin = createAdminClient();
  return createLearningSubmitService({
    actorId: async () => (await getActor())?.id ?? null,
    issued: createSupabaseLearningStateClient(admin),
    rpc: admin,
  });
}

export async function submitLearning(raw: unknown) {
  return createProductionLearningSubmitService().submitLearning(raw);
}
