import { describe, expect, it } from 'vitest';
import { commitLearningRpc } from './repository';

describe('commitLearningRpc', () => {
  it('uses the closed RPC contract and maps a receipt without exposing the service client', async () => {
    const calls: unknown[] = [];
    const result = await commitLearningRpc({
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return {
          data: {
            sessionId: '11111111-1111-4111-8111-111111111111',
            acceptedAt: '2026-09-13T00:00:00.000Z', score: 1, maxScore: 1,
            correctCount: 1, totalQuestions: 1, xpAwarded: 10,
            integrityVersion: 1, scoringVersion: 'ent-v1',
          },
          error: null,
        };
      },
    }, {
      actorId: '22222222-2222-4222-8222-222222222222',
      operationId: '33333333-3333-4333-8333-333333333333',
      payloadHash: 'abc', sessionId: '44444444-4444-4444-8444-444444444444',
      scoringVersion: 'ent-v1', gradedItems: [],
    });

    expect(result).toMatchObject({ score: 1, integrityVersion: 1 });
    expect(calls).toEqual([expect.objectContaining({ name: 'commit_learning_v1', args: expect.objectContaining({
      actor_id: '22222222-2222-4222-8222-222222222222',
      graded_items: [],
    }) })]);
  });
});
