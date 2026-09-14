import 'server-only';

import type { LearningError, Receipt } from './contracts';
import type { ServerGradedItem } from './service';

type RpcResponse = { data: unknown; error: { message?: string } | null };
type CommitError = Exclude<LearningError, 'unauthenticated' | 'invalid-input'>;

export type LearningRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse>;
};

export type CommitRpcInput = {
  actorId: string;
  operationId: string;
  payloadHash: string;
  sessionId: string;
  scoringVersion: 'ent-v1';
  gradedItems: ServerGradedItem[];
};

const knownErrors = new Set<CommitError>([
  'forbidden', 'not-found', 'expired', 'already-submitted',
  'operation-conflict', 'content-unavailable', 'rate-limited', 'temporarily-unavailable',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isReceipt(value: unknown): value is Receipt {
  return isRecord(value)
    && typeof value.sessionId === 'string'
    && typeof value.acceptedAt === 'string'
    && typeof value.score === 'number'
    && typeof value.maxScore === 'number'
    && typeof value.correctCount === 'number'
    && typeof value.totalQuestions === 'number'
    && typeof value.xpAwarded === 'number'
    && value.integrityVersion === 1
    && value.scoringVersion === 'ent-v1';
}

function rpcError(value: unknown): CommitError | null {
  if (!isRecord(value) || typeof value.error !== 'string') return null;
  return knownErrors.has(value.error as CommitError) ? value.error as CommitError : null;
}

/**
 * The only adapter allowed to call commit_learning_v1. The server service
 * passes a verified actor and server-grades every item before reaching here.
 */
export async function commitLearningRpc(
  client: LearningRpcClient,
  input: CommitRpcInput
): Promise<Receipt | { error: CommitError }> {
  const response = await client.rpc('commit_learning_v1', {
    actor_id: input.actorId,
    operation_id: input.operationId,
    payload_hash: input.payloadHash,
    session_id: input.sessionId,
    scoring_version: input.scoringVersion,
    graded_items: input.gradedItems.map((item) => ({
      itemId: item.itemId,
      questionVersionId: item.questionVersionId,
      answer: item.answer,
      points: item.points,
      maxPoints: item.maxPoints,
      timeSpentMs: item.timeSpentMs,
    })),
  });
  if (response.error) return { error: 'temporarily-unavailable' };
  if (isReceipt(response.data)) return response.data;
  const error = rpcError(response.data);
  if (error) return { error };
  return { error: 'temporarily-unavailable' };
}
