import { afterEach, expect, it, vi } from 'vitest';
const services = vi.hoisted(() => ({ start: vi.fn(), state: vi.fn(), submit: vi.fn(), review: vi.fn() }));
vi.mock('@/lib/learning/start', () => ({ startLearning: services.start }));
vi.mock('@/lib/learning/state', () => ({ getLearningState: services.state }));
vi.mock('@/lib/learning/submit', () => ({ submitLearning: services.submit }));
vi.mock('@/lib/learning/review', () => ({ getLearningReview: services.review }));
import { startTopicLearning, readLearningState, submitTopicLearning, readLearningReview } from './learning-actions';
const input = { operationId: '22222222-2222-4222-8222-222222222222', locale: 'ru', mode: 'practice', topicSlug: 'logarithms' };
afterEach(() => { vi.resetAllMocks(); delete process.env.LEARNING_V1_ENABLED; });

it('denies every bridge when the rollout flag is disabled', async () => {
  for (const call of [startTopicLearning, readLearningState, submitTopicLearning, readLearningReview]) {
    expect(await call(input)).toMatchObject({ ok: false, error: 'forbidden' });
  }
  expect(services.start).not.toHaveBeenCalled();
  expect(services.submit).not.toHaveBeenCalled();
});

it('rejects unsupported modes and authority fields instead of stripping them', async () => {
  process.env.LEARNING_V1_ENABLED = 'true';
  for (const bad of [{ ...input, actor: 'owner' }, { ...input, mode: 'diagnostic', second: 'physics' }, { ...input, assignmentId: input.operationId }]) {
    expect(await startTopicLearning(bad)).toMatchObject({ ok: false, error: 'invalid-input' });
  }
  expect(services.start).not.toHaveBeenCalled();
});

it('passes only practice selectors and contains unexpected service exceptions', async () => {
  process.env.LEARNING_V1_ENABLED = 'true';
  services.start.mockRejectedValue(new Error('private service credential'));
  const result = await startTopicLearning(input);
  expect(services.start).toHaveBeenCalledWith(input);
  expect(result).toMatchObject({ ok: false, error: 'temporarily-unavailable' });
  expect(JSON.stringify(result)).not.toContain('credential');
});
