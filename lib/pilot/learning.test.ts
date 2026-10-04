import { describe, expect, it } from 'vitest';
import { createAssignedPracticeService } from './learning';
import type { LearningRpcClient, LearningStateClient } from '@/lib/learning/repository';

const actorId = '11111111-1111-4111-8111-111111111111';
const assignmentId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const itemId = '55555555-5555-4555-8555-555555555555';

function activeSessionRow(): Record<string, unknown> {
  return {
    id: sessionId, user_id: actorId, status: 'active', mode: 'practice',
    expires_at: '2026-10-05T12:00:00.000Z', receipt: null, scoring_version: 'ent-v1',
    session_items: [{
      id: itemId, position: 0,
      question_versions: {
        id: '66666666-6666-4666-8666-666666666666',
        question_id: '77777777-7777-4777-8777-777777777777',
        family_id: '88888888-8888-4888-8888-888888888888', revision: 1,
        locale: 'kk', type: 'single',
        public_body: { stem: 'Теңдеуді шешіңіз', options: [{ id: 'A', content: '$4$' }] },
        grading_body: { stem: 'Теңдеуді шешіңіз', options: [{ id: 'A', content: '$4$' }], correct: 'A' },
        explanation: null, context_snapshot: null, content_hash: 'sha256:test',
        question_publications: { status: 'approved' },
        questions: { topic_id: '99999999-9999-4999-8999-999999999999', topics: {
          slug: 'linear-quadratic-rational-equations',
          subject_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', subjects: { slug: 'math' },
        } },
      },
    }],
  };
}

function service(input: {
  rpcResponse: unknown;
  stateResponse?: unknown;
  actor?: string | null;
  calls?: unknown[];
}) {
  const calls = input.calls ?? [];
  const rpc: LearningRpcClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: input.rpcResponse, error: null };
    },
  };
  const state: LearningStateClient = {
    readSession: async () => ({ data: input.stateResponse === undefined ? activeSessionRow() : input.stateResponse, error: null }),
  };
  return createAssignedPracticeService({
    actorId: async () => input.actor === undefined ? actorId : input.actor,
    rpc,
    state,
    now: () => new Date('2026-10-05T10:00:00.000Z'),
  });
}

describe('assigned practice server service', () => {
  it('rejects forged scope fields before calling the RPC', async () => {
    const calls: unknown[] = [];
    const result = await service({ rpcResponse: {}, calls }).startAssignedPractice({
      operationId, assignmentId, actorId, schoolId: crypto.randomUUID(), locale: 'kk',
      topicSlug: 'forged', versionId: crypto.randomUUID(), score: 100,
    });
    expect(result).toMatchObject({ ok: false, error: 'invalid-input' });
    expect(calls).toEqual([]);
  });

  it('requires Auth before calling the RPC', async () => {
    const calls: unknown[] = [];
    const result = await service({ rpcResponse: {}, actor: null, calls }).startAssignedPractice({ operationId, assignmentId });
    expect(result).toMatchObject({ ok: false, error: 'unauthenticated' });
    expect(calls).toEqual([]);
  });

  it('uses a server-owned assignment request and returns only its hydrated public session', async () => {
    const calls: unknown[] = [];
    const result = await service({
      rpcResponse: { status: 'active', sessionId, totalSteps: 3, completedSteps: 1 }, calls,
    }).startAssignedPractice({ operationId, assignmentId });

    expect(result).toMatchObject({
      ok: true, value: { status: 'active', totalSteps: 3, completedSteps: 1,
        learning: { sessions: [{ id: sessionId, items: [{ id: itemId, question: { id: expect.any(String) } }] }] } },
    });
    expect(JSON.stringify(result)).not.toContain('correct');
    expect(calls).toEqual([{
      name: 'pilot_start_assigned_learning_v1',
      args: expect.objectContaining({ actor_id: actorId, operation_id: operationId, assignment_id: assignmentId, payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    }]);
  });

  it('returns a completed assignment without querying arbitrary session content', async () => {
    const result = await service({
      rpcResponse: { status: 'completed', totalSteps: 3, completedSteps: 3 },
    }).startAssignedPractice({ operationId, assignmentId });
    expect(result).toEqual({ ok: true, value: { status: 'completed', totalSteps: 3, completedSteps: 3 } });
  });

  it('recovers a repeated start as already submitted without issuing the next item', async () => {
    const receipt = { sessionId, acceptedAt: '2026-10-05T11:00:00.000Z', score: 1, maxScore: 1,
      correctCount: 1, totalQuestions: 1, xpAwarded: 0, integrityVersion: 1, scoringVersion: 'ent-v1' };
    const calls: unknown[] = [];
    const result = await service({
      rpcResponse: { status: 'active', sessionId, totalSteps: 3, completedSteps: 0 },
      stateResponse: { ...activeSessionRow(), status: 'submitted', receipt }, calls,
    }).startAssignedPractice({ operationId, assignmentId });
    expect(result).toMatchObject({ ok: false, error: 'already-submitted' });
    expect(calls).toHaveLength(1);
  });

  it('recovers an expired start receipt without replacing its original session', async () => {
    const result = await service({
      rpcResponse: { status: 'active', sessionId, totalSteps: 3, completedSteps: 0 },
      stateResponse: { ...activeSessionRow(), status: 'expired' },
    }).startAssignedPractice({ operationId, assignmentId });
    expect(result).toMatchObject({ ok: false, error: 'expired' });
  });

  it('treats malformed transport data and unavailable hydrated work as temporarily unavailable', async () => {
    await expect(service({ rpcResponse: { status: 'active', sessionId, totalSteps: 1, completedSteps: 1 } })
      .startAssignedPractice({ operationId, assignmentId }))
      .resolves.toMatchObject({ ok: false, error: 'temporarily-unavailable' });
    await expect(service({ rpcResponse: { status: 'active', sessionId, totalSteps: 2, completedSteps: 0 }, stateResponse: null })
      .startAssignedPractice({ operationId, assignmentId }))
      .resolves.toMatchObject({ ok: false, error: 'not-found' });
  });
});
