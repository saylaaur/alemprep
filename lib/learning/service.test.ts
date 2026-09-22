import { describe, expect, it } from 'vitest';
import type { QuestionVersion } from '@/lib/content/versions';
import { createLearningService, startPayloadHash, submitPayloadHash } from './service';

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
  it('hashes the validated start request without its idempotency operation ID', () => {
    const request = {
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      locale: 'kk' as const,
      mode: 'practice' as const,
      topicSlug: 'radicals-and-expressions',
    };

    expect(startPayloadHash(request)).toBe(startPayloadHash({
      ...request,
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }));
    expect(startPayloadHash(request)).not.toBe(startPayloadHash({
      ...request,
      topicSlug: 'logarithms',
    }));
  });

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

  it('starts only a server-owned request and rejects assignments before school scopes exist', async () => {
    const starts: unknown[] = [];
    const service = createLearningService({
      actorId: async () => '57555555-5555-4555-8555-555555555555',
      start: async (input) => {
        starts.push(input);
        return { sessions: [] };
      },
      getState: async () => ({ error: 'not-found' }),
      loadIssuedSession: async () => null,
      commit: async () => ({ error: 'temporarily-unavailable' }),
    });

    const result = await service.start({
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      locale: 'kk', mode: 'practice', topicSlug: 'radicals-and-expressions',
    });
    expect(result).toEqual({ ok: true, value: { sessions: [] } });
    expect(starts).toEqual([expect.objectContaining({
      actorId: '57555555-5555-4555-8555-555555555555',
      payloadHash: startPayloadHash({
        operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        locale: 'kk', mode: 'practice', topicSlug: 'radicals-and-expressions',
      }),
    })]);

    const assigned = await service.start({
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      locale: 'kk', mode: 'practice',
      topicSlug: 'radicals-and-expressions',
      assignmentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(assigned).toMatchObject({ ok: false, error: 'forbidden' });
    expect(starts).toHaveLength(1);
  });

  it('normalizes omitted issued items before passing server grades to the repository', async () => {
    const committed: unknown[] = [];
    const service = createLearningService({
      actorId: async () => '57555555-5555-4555-8555-555555555555',
      start: async () => ({ sessions: [] }),
      getState: async () => ({ error: 'not-found' }),
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

  it('reads state only through the authenticated owner boundary', async () => {
    const reads: unknown[] = [];
    const service = createLearningService({
      actorId: async () => '57555555-5555-4555-8555-555555555555',
      start: async () => ({ sessions: [] }),
      getState: async (input) => {
        reads.push(input);
        return { status: 'expired', sessionId: input.sessionId };
      },
      loadIssuedSession: async () => null,
      commit: async () => ({ error: 'temporarily-unavailable' }),
    });

    await expect(service.getState('not-a-uuid')).resolves.toMatchObject({ ok: false, error: 'invalid-input' });
    await expect(service.getState(sessionId)).resolves.toEqual({
      ok: true,
      value: { status: 'expired', sessionId },
    });
    expect(reads).toEqual([{ actorId: '57555555-5555-4555-8555-555555555555', sessionId }]);
  });

  it('does not ask the repository about state after logout', async () => {
    const service = createLearningService({
      actorId: async () => null,
      start: async () => ({ sessions: [] }),
      getState: async () => {
        throw new Error('repository must not be called without an actor');
      },
      loadIssuedSession: async () => null,
      commit: async () => ({ error: 'temporarily-unavailable' }),
    });

    await expect(service.getState(sessionId)).resolves.toMatchObject({ ok: false, error: 'unauthenticated' });
  });
});
