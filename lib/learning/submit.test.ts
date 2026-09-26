import { describe, expect, it } from 'vitest';
import { createLearningSubmitService } from './submit';

const actorId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';

describe('learning submit service', () => {
  it('derives the owner and grades the issued immutable version before the closed commit RPC', async () => {
    const commits: unknown[] = [];
    const service = createLearningSubmitService({
      actorId: async () => actorId,
      issued: {
        readSession: async () => ({ data: {
          id: sessionId,
          user_id: actorId,
          scoring_version: 'ent-v1',
          session_items: [{
            id: itemId,
            position: 0,
            question_versions: {
              id: '44444444-4444-4444-8444-444444444444',
              question_id: '55555555-5555-4555-8555-555555555555',
              family_id: '66666666-6666-4666-8666-666666666666',
              revision: 1,
              locale: 'kk',
              type: 'single',
              public_body: { stem: 'Сұрақ', options: [{ id: 'A', content: '1' }, { id: 'B', content: '2' }] },
              grading_body: { stem: 'Сұрақ', options: [{ id: 'A', content: '1' }, { id: 'B', content: '2' }], correct: 'A' },
              explanation: null,
              context_snapshot: null,
              content_hash: 'sha256:test',
              question_publications: { status: 'approved' },
              questions: { topic_id: '77777777-7777-4777-8777-777777777777', topics: { slug: 'algebra', subject_id: '88888888-8888-4888-8888-888888888888', subjects: { slug: 'math' } } },
            },
          }],
        }, error: null }),
      },
      rpc: {
        rpc: async (_name, args) => {
          commits.push(args);
          return { data: {
            sessionId,
            acceptedAt: '2026-09-25T10:00:00.000Z',
            score: 1,
            maxScore: 1,
            correctCount: 1,
            totalQuestions: 1,
            xpAwarded: 10,
            integrityVersion: 1,
            scoringVersion: 'ent-v1',
          }, error: null };
        },
      },
    });

    await expect(service.submitLearning({
      operationId: '99999999-9999-4999-8999-999999999999',
      sessionId,
      answers: [{ itemId, answer: 'A', timeSpentMs: 1 }],
    })).resolves.toMatchObject({ ok: true, value: { score: 1, sessionId } });
    expect(commits).toEqual([expect.objectContaining({
      actor_id: actorId,
      session_id: sessionId,
      graded_items: [expect.objectContaining({ itemId, answer: 'A', points: 1, maxPoints: 1 })],
    })]);
  });
});
