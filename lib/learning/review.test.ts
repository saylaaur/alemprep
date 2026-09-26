import { describe, expect, it } from 'vitest';
import { createLearningReviewService } from './review';

const actorId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';

function submittedSession(status: 'active' | 'submitted' = 'submitted') {
  return {
    id: sessionId,
    user_id: actorId,
    status,
    receipt: status === 'submitted' ? {
      sessionId,
      acceptedAt: '2026-09-25T10:00:00.000Z',
      score: 1,
      maxScore: 1,
      correctCount: 1,
      totalQuestions: 1,
      xpAwarded: 10,
      integrityVersion: 1,
      scoringVersion: 'ent-v1',
    } : null,
    session_items: [{
      id: itemId,
      position: 0,
      attempts: [{ given_answer: 'A', points: 1, max_points: 1, integrity_version: 1 }],
      question_versions: {
        id: '44444444-4444-4444-8444-444444444444',
        question_id: '55555555-5555-4555-8555-555555555555',
        family_id: '66666666-6666-4666-8666-666666666666',
        revision: 1,
        locale: 'kk',
        type: 'single',
        public_body: { stem: 'Сұрақ', options: [{ id: 'A', content: '1' }, { id: 'B', content: '2' }] },
        grading_body: { stem: 'Сұрақ', options: [{ id: 'A', content: '1' }, { id: 'B', content: '2' }], correct: 'A' },
        explanation: { blocks: [{ value: 'Түсіндірме' }] },
        context_snapshot: null,
        content_hash: 'sha256:test',
        question_publications: { status: 'approved' },
        questions: { topic_id: '77777777-7777-4777-8777-777777777777', topics: { slug: 'algebra', subject_id: '88888888-8888-4888-8888-888888888888', subjects: { slug: 'math' } } },
      },
    }],
  };
}

describe('learning review service', () => {
  it('reveals answers and explanations only from a submitted owner session', async () => {
    const service = createLearningReviewService({
      actorId: async () => actorId,
      review: { readSession: async () => ({ data: submittedSession(), error: null }) },
    });

    await expect(service.getLearningReview(sessionId)).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        receipt: expect.objectContaining({ sessionId, score: 1 }),
        items: [expect.objectContaining({ itemId, answer: 'A', points: 1, maxPoints: 1, explanation: { blocks: [{ value: 'Түсіндірме' }] }, gradingBody: expect.objectContaining({ correct: 'A' }) })],
      }),
    });
  });

  it('does not reveal a review before a session is submitted', async () => {
    const service = createLearningReviewService({
      actorId: async () => actorId,
      review: { readSession: async () => ({ data: submittedSession('active'), error: null }) },
    });

    await expect(service.getLearningReview(sessionId)).resolves.toMatchObject({ ok: false, error: 'not-found' });
  });

  it('fails closed when a stored answer no longer matches its immutable version', async () => {
    const raw = submittedSession();
    raw.session_items[0]!.attempts[0]!.given_answer = 'C';
    const service = createLearningReviewService({
      actorId: async () => actorId,
      review: { readSession: async () => ({ data: raw, error: null }) },
    });

    await expect(service.getLearningReview(sessionId)).resolves.toMatchObject({ ok: false, error: 'temporarily-unavailable' });
  });
});
