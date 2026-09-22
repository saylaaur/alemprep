import { describe, expect, it } from 'vitest';
import { commitLearningRpc, startLearningRpc, type LearningRpcClient } from './repository';

const actorId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const itemId = '55555555-5555-4555-8555-555555555555';

function client(response: unknown): LearningRpcClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: response, error: null };
    },
  };
}

const plan = {
  sessions: [{
    mode: 'practice' as const,
    locale: 'kk' as const,
    topicId: '66666666-6666-4666-8666-666666666666',
    subjectId: '77777777-7777-4777-8777-777777777777',
    expiresAt: '2026-09-22T12:00:00.000Z',
    scoringVersion: 'ent-v1' as const,
    manifestHash: 'sha256:abc',
    items: [{ versionId }],
  }],
};

describe('start learning RPC adapter', () => {
  it('sends only the server plan and strictly decodes issued session references', async () => {
    const rpc = client({ sessions: [{
      id: sessionId,
      mode: 'practice',
      expiresAt: '2026-09-22T12:00:00.000Z',
      itemIds: [itemId],
    }] });

    await expect(startLearningRpc(rpc, {
      actorId,
      operationId,
      payloadHash: 'a'.repeat(64),
      plan,
    })).resolves.toEqual({
      sessions: [{ id: sessionId, mode: 'practice', expiresAt: '2026-09-22T12:00:00.000Z', itemIds: [itemId] }],
    });
    expect(rpc.calls).toEqual([{
      name: 'start_learning_v1',
      args: { actor_id: actorId, operation_id: operationId, payload_hash: 'a'.repeat(64), plan },
    }]);
  });

  it('does not accept a malformed RPC result as a learning session', async () => {
    const rpc = client({ sessions: [{ id: sessionId, mode: 'practice', itemIds: [itemId] }] });
    await expect(startLearningRpc(rpc, { actorId, operationId, payloadHash: 'hash', plan }))
      .resolves.toEqual({ error: 'temporarily-unavailable' });
  });

  it('maps only known domain errors and hides raw database failures', async () => {
    const unavailable = client({ error: 'content-unavailable' });
    await expect(startLearningRpc(unavailable, { actorId, operationId, payloadHash: 'hash', plan }))
      .resolves.toEqual({ error: 'content-unavailable' });

    const rawFailure: LearningRpcClient = {
      rpc: async () => ({ data: null, error: { message: 'relation internal_secret does not exist' } }),
    };
    await expect(startLearningRpc(rawFailure, { actorId, operationId, payloadHash: 'hash', plan }))
      .resolves.toEqual({ error: 'temporarily-unavailable' });
  });
});

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
