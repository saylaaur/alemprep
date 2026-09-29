'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isLearningEnabled } from '@/lib/learning/feature-flag';
import { startLearning } from '@/lib/learning/start';
import { getLearningState } from '@/lib/learning/state';
import { submitLearning } from '@/lib/learning/submit';
import { getLearningReview } from '@/lib/learning/review';
import type { LearningError, Result } from '@/lib/learning/contracts';

const topicStart = z.object({
  operationId: z.uuid(), locale: z.enum(['ru', 'kk']), mode: z.literal('practice'),
  topicSlug: z.string().min(1).max(160),
}).strict();

function failure(error: LearningError): Result<never> {
  return { ok: false, error, requestId: randomUUID() };
}

async function guarded<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  if (!isLearningEnabled()) return failure('forbidden');
  try { return await work(); }
  catch { return failure('temporarily-unavailable'); }
}

export async function startTopicLearning(raw: unknown) {
  return guarded(async () => {
    const parsed = topicStart.safeParse(raw);
    if (!parsed.success) return failure('invalid-input');
    return startLearning(parsed.data);
  });
}

export async function readLearningState(raw: unknown) {
  return guarded(() => getLearningState(raw));
}

export async function submitTopicLearning(raw: unknown) {
  // A successful receipt is never replaced by a cache revalidation exception.
  return guarded(() => submitLearning(raw));
}

export async function readLearningReview(raw: unknown) {
  return guarded(() => getLearningReview(raw));
}
