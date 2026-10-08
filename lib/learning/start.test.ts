import { describe, expect, it } from 'vitest';
import { createLearningStartService } from './start';
import type { LearningContentClient, LearningRpcClient } from './repository';

const actorId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const itemId = '55555555-5555-4555-8555-555555555555';

function approvedVersionRow(): Record<string, unknown> {
  return {
    id: versionId,
    question_id: '88888888-8888-4888-8888-888888888888',
    family_id: '99999999-9999-4999-8999-999999999999',
    revision: 1,
    locale: 'kk', type: 'single',
    public_body: { stem: 'Сұрақ', options: [{ id: 'A', content: '1' }] },
    grading_body: { stem: 'Сұрақ', options: [{ id: 'A', content: '1' }], correct: 'A' },
    explanation: null, context_snapshot: null, content_hash: 'sha256:version',
    question_publications: { status: 'approved' },
    questions: { topic_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', topics: {
      slug: 'radicals-and-expressions', subject_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', subjects: { slug: 'math' },
    } },
  };
}

function contentClient(calls: unknown[]): LearningContentClient {
  return {
    readApprovedVersions: async (locale, selection) => {
      calls.push({ locale, selection });
      return { data: [approvedVersionRow()], error: null };
    },
  };
}

function rpcClient(calls: unknown[]): LearningRpcClient {
  return {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { sessions: [{ id: sessionId, mode: 'practice', expiresAt: '2026-09-22T12:00:00.000Z', itemIds: [itemId] }] }, error: null };
    },
  };
}

describe('learning start service', () => {
  it('checks a matching replay before consulting the mutable approved catalog', async () => {
    const contentCalls: unknown[] = [];
    const rpcCalls: unknown[] = [];
    const service = createLearningStartService({
      actorId: async () => actorId,
      content: contentClient(contentCalls),
      rpc: rpcClient(rpcCalls),
      now: () => new Date('2026-09-22T10:00:00.000Z'),
      findReplay: async () => ({ sessions: [] }),
    });

    await expect(service.startLearning({ operationId, locale: 'kk', mode: 'practice', topicSlug: 'radicals-and-expressions' }))
      .resolves.toEqual({ ok: true, value: { sessions: [] } });
    expect(contentCalls).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it('returns a replay conflict before any content selection', async () => {
    const contentCalls: unknown[] = [];
    const service = createLearningStartService({
      actorId: async () => actorId,
      content: contentClient(contentCalls),
      rpc: rpcClient([]),
      now: () => new Date('2026-09-22T10:00:00.000Z'),
      findReplay: async () => ({ error: 'operation-conflict' }),
    });

    await expect(service.startLearning({ operationId, locale: 'kk', mode: 'practice', topicSlug: 'radicals-and-expressions' }))
      .resolves.toMatchObject({ ok: false, error: 'operation-conflict' });
    expect(contentCalls).toEqual([]);
  });

  it('uses a bounded topic catalog, an atomic RPC, and a public DTO for a new start', async () => {
    const contentCalls: unknown[] = [];
    const rpcCalls: unknown[] = [];
    let replayCalls = 0;
    const service = createLearningStartService({
      actorId: async () => actorId,
      content: contentClient(contentCalls),
      rpc: rpcClient(rpcCalls),
      now: () => new Date('2026-09-22T10:00:00.000Z'),
      findReplay: async () => {
        replayCalls += 1;
        return replayCalls === 1 ? null : {
          sessions: [{
            id: sessionId,
            mode: 'practice' as const,
            expiresAt: '2026-09-22T12:00:00.000Z',
            items: [{ id: itemId, position: 0, question: {
              id: versionId, locale: 'kk' as const, type: 'single' as const,
              body: { stem: 'Сұрақ', options: [{ id: 'A', content: '1' }] }, context: null,
              topicLabel: 'radicals-and-expressions',
            } }],
          }],
        };
      },
    });

    const result = await service.startLearning({ operationId, locale: 'kk', mode: 'practice', topicSlug: 'radicals-and-expressions' });
    expect(result).toMatchObject({ ok: true, value: { sessions: [{ id: sessionId, items: [{ id: itemId, question: { id: versionId } }] }] } });
    expect(JSON.stringify(result)).not.toContain('correct');
    expect(contentCalls).toEqual([{ locale: 'kk', selection: { topicSlug: 'radicals-and-expressions' } }]);
    expect(rpcCalls).toEqual([expect.objectContaining({ name: 'start_learning_v1' })]);
    expect(replayCalls).toBe(2);
  });

  it('passes the pupil practice history of the topic to selection and survives a failed read', async () => {
    const historyCalls: unknown[] = [];
    const rpcCalls: unknown[] = [];
    const build = (recent: () => Promise<string[]>) => {
      let replays = 0;
      return createLearningStartService({
        actorId: async () => actorId,
        content: contentClient([]),
        rpc: rpcClient(rpcCalls),
        now: () => new Date('2026-09-22T10:00:00.000Z'),
        recentPracticeFamilies: async (input) => {
          historyCalls.push(input);
          return recent();
        },
        findReplay: async () => (replays++ === 0 ? null : { sessions: [] }),
      });
    };
    const request = { operationId, locale: 'kk', mode: 'practice', topicSlug: 'radicals-and-expressions' };

    // Only one approved task: it is served even though it was already seen.
    await expect(build(async () => ['99999999-9999-4999-8999-999999999999']).startLearning(request))
      .resolves.toEqual({ ok: true, value: { sessions: [] } });
    await expect(build(async () => { throw new Error('history down'); }).startLearning(request))
      .resolves.toEqual({ ok: true, value: { sessions: [] } });
    expect(rpcCalls).toHaveLength(2);
    expect(historyCalls).toEqual([
      { actorId, topicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { actorId, topicId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ]);
  });

  it('recovers a matching receipt after a concurrent RPC wait times out without issuing twice', async () => {
    const contentCalls: unknown[] = [];
    const rpcCalls: unknown[] = [];
    let replayCalls = 0;
    const service = createLearningStartService({
      actorId: async () => actorId,
      content: contentClient(contentCalls),
      rpc: {
        rpc: async (name, args) => {
          rpcCalls.push({ name, args });
          return { data: null, error: { message: 'lock timeout' } };
        },
      },
      now: () => new Date('2026-09-22T10:00:00.000Z'),
      retryPause: async () => undefined,
      findReplay: async () => {
        replayCalls += 1;
        return replayCalls === 1 ? null : { sessions: [] };
      },
    });

    await expect(service.startLearning({ operationId, locale: 'kk', mode: 'practice', topicSlug: 'radicals-and-expressions' }))
      .resolves.toEqual({ ok: true, value: { sessions: [] } });
    expect(replayCalls).toBe(2);
    expect(contentCalls).toHaveLength(1);
    expect(rpcCalls).toHaveLength(1);
  });

  it('reads each assessment subject through its own bounded catalog query', async () => {
    const contentCalls: unknown[] = [];
    const service = createLearningStartService({
      actorId: async () => actorId,
      content: contentClient(contentCalls),
      rpc: rpcClient([]),
      now: () => new Date('2026-09-22T10:00:00.000Z'),
      findReplay: async () => null,
    });

    await expect(service.startLearning({ operationId, locale: 'kk', mode: 'mock_exam', second: 'physics' }))
      .resolves.toMatchObject({ ok: false, error: 'content-unavailable' });
    expect(contentCalls).toEqual([
      { locale: 'kk', selection: { subjectSlugs: ['math'], type: 'single' } },
      { locale: 'kk', selection: { subjectSlugs: ['math'], type: 'multi' } },
      { locale: 'kk', selection: { subjectSlugs: ['math'], type: 'matching' } },
      { locale: 'kk', selection: { subjectSlugs: ['physics'], type: 'single' } },
      { locale: 'kk', selection: { subjectSlugs: ['physics'], type: 'multi' } },
      { locale: 'kk', selection: { subjectSlugs: ['physics'], type: 'matching' } },
    ]);
  });
});
