import 'server-only';

import { randomUUID } from 'node:crypto';
import { getActor } from '@/lib/server/actor';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseLearningReviewClient, loadLearningReview, type LearningReviewClient } from './repository';
import { validateSessionId } from './validation';

export type LearningReviewDependencies = {
  actorId: () => Promise<string | null>;
  review: LearningReviewClient;
};

function failure(error: 'unauthenticated' | 'invalid-input' | 'not-found' | 'temporarily-unavailable') {
  return { ok: false as const, error, requestId: randomUUID() };
}

/** Server-only review boundary; submitted owner sessions are the only source of answers. */
export function createLearningReviewService(dependencies: LearningReviewDependencies) {
  return {
    async getLearningReview(raw: unknown) {
      let sessionId: string;
      try {
        sessionId = validateSessionId(raw);
      } catch {
        return failure('invalid-input');
      }
      const actorId = await dependencies.actorId();
      if (!actorId) return failure('unauthenticated');
      const review = await loadLearningReview(dependencies.review, actorId, sessionId);
      if ('error' in review) return failure(review.error);
      return { ok: true as const, value: review };
    },
  };
}

/** Production factory with Auth-derived actor and server-only review access. */
export function createProductionLearningReviewService() {
  const admin = createAdminClient();
  return createLearningReviewService({
    actorId: async () => (await getActor())?.id ?? null,
    review: createSupabaseLearningReviewClient(admin),
  });
}

export async function getLearningReview(raw: unknown) {
  return createProductionLearningReviewService().getLearningReview(raw);
}
