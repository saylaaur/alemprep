import { describe, expect, it } from 'vitest';
import type { QuestionVersion } from '@/lib/content/versions';
import { createLearningService, submitPayloadHash } from './service';

const firstItemId = '17111111-1111-4111-8111-111111111111';
const secondItemId = '27222222-2222-4222-8222-222222222222';
const sessionId = '37333333-3333-4333-8333-333333333333';

function version(id: string, questionId: string): QuestionVersion {
  return {
    id,
    questionId,
    familyId: '47444444-4444-4444-8444-444444444444',
    revision: 1,
    locale: 'kk',
    type: 'single',
    topicLabel: 'Сынақ',
    publicBody: { stem: 'Сұрақ', options: [{ id: 'A', content: 'A' }, { id: 'B', content: 'B' }] },
    gradingBody: { stem: 'Сұрақ', options: [{ id: 'A', content: 'A' }, { id: 'B', content: 'B' }], correct: 'A' },
    explanation: null,
    contextSnapshot: null,
    contentHash: 'sha256:test',
  };
}

describe('learning service', () => {
  it('hashes equivalent multi-select answer order canonically', () => {
    const base = {
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessionId,
      answers: [{ itemId: firstItemId, answer: ['A', 'B'], timeSpentMs: 1500 }],
    };

    expect(submitPayloadHash(base)).toBe(submitPayloadHash({
      ...base,
      answers: [{ itemId: firstItemId, answer: ['B', 'A'], timeSpentMs: 1500 }],
    }));
  });

  it('normalizes omitted issued items before passing server grades to the repository', async () => {
    const committed: unknown[] = [];
    const service = createLearningService({
      actorId: async () => '57555555-5555-4555-8555-555555555555',
      loadIssuedSession: async () => ({
        id: sessionId,
        scoringVersion: 'ent-v1',
        items: [
          { id: firstItemId, version: version('68666666-6666-4666-8666-666666666666', '79777777-7777-4777-8777-777777777777') },
          { id: secondItemId, version: version('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999') },
        ],
      }),
      commit: async (input) => {
        committed.push(input);
        return {
          sessionId,
          acceptedAt: '2026-09-13T00:00:00.000Z', score: 1, maxScore: 2,
          correctCount: 1, totalQuestions: 2, xpAwarded: 10,
          integrityVersion: 1, scoringVersion: 'ent-v1',
        };
      },
    });

    const result = await service.submit({
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessionId,
      answers: [{ itemId: firstItemId, answer: 'A', timeSpentMs: 1500 }],
    });

    expect(result).toMatchObject({ ok: true, value: { maxScore: 2, score: 1 } });
    expect(committed).toEqual([expect.objectContaining({
      gradedItems: [
        expect.objectContaining({ itemId: firstItemId, points: 1, maxPoints: 1, answer: 'A' }),
        expect.objectContaining({ itemId: secondItemId, points: 0, maxPoints: 1, answer: null }),
      ],
    })]);
  });
});
