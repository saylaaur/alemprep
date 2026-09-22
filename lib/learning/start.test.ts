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
    const service = createLearningStartService({
      actorId: async () => actorId,
      content: contentClient(contentCalls),
      rpc: rpcClient(rpcCalls),
      now: () => new Date('2026-09-22T10:00:00.000Z'),
      findReplay: async () => null,
    });

    const result = await service.startLearning({ operationId, locale: 'kk', mode: 'practice', topicSlug: 'radicals-and-expressions' });
    expect(result).toMatchObject({ ok: true, value: { sessions: [{ id: sessionId, items: [{ id: itemId, question: { id: versionId } }] }] } });
    expect(JSON.stringify(result)).not.toContain('correct');
    expect(contentCalls).toEqual([{ locale: 'kk', selection: { topicSlug: 'radicals-and-expressions' } }]);
    expect(rpcCalls).toEqual([expect.objectContaining({ name: 'start_learning_v1' })]);
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
      { locale: 'kk', selection: { subjectSlugs: ['math'] } },
      { locale: 'kk', selection: { subjectSlugs: ['physics'] } },
    ]);
  });
});
