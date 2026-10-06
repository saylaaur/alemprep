import 'server-only';

import type { LearningError } from '@/lib/learning/contracts';
import type { LearningRpcClient } from '@/lib/learning/repository';

export type AssignedStartRpcResult =
  | { status: 'active'; sessionId: string; totalSteps: number; completedSteps: number }
  | { status: 'completed'; totalSteps: number; completedSteps: number };

type AssignedStartError = Exclude<LearningError, 'unauthenticated' | 'invalid-input'>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const knownErrors = new Set<AssignedStartError>([
  'forbidden', 'not-found', 'expired', 'already-submitted', 'operation-conflict',
  'content-unavailable', 'rate-limited', 'temporarily-unavailable',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 80;
}

function decodeAssignedStart(value: unknown): AssignedStartRpcResult | { error: AssignedStartError } | null {
  if (!isRecord(value)) return null;
  if (typeof value.error === 'string' && Object.keys(value).length === 1 && knownErrors.has(value.error as AssignedStartError)) {
    return { error: value.error as AssignedStartError };
  }
  if (value.status === 'active' && Object.keys(value).length === 4
    && typeof value.sessionId === 'string' && uuidPattern.test(value.sessionId)
    && isCount(value.totalSteps) && isCount(value.completedSteps) && value.completedSteps < value.totalSteps) {
    return { status: 'active', sessionId: value.sessionId, totalSteps: value.totalSteps, completedSteps: value.completedSteps };
  }
  if (value.status === 'completed' && Object.keys(value).length === 3
    && isCount(value.totalSteps) && isCount(value.completedSteps) && value.completedSteps === value.totalSteps) {
    return { status: 'completed', totalSteps: value.totalSteps, completedSteps: value.completedSteps };
  }
  return null;
}

/** Strict transport adapter for the service-only pilot assigned-start RPC. */
export async function startAssignedLearningRpc(
  client: LearningRpcClient,
  input: { actorId: string; operationId: string; payloadHash: string; assignmentId: string },
): Promise<AssignedStartRpcResult | { error: AssignedStartError }> {
  const response = await client.rpc('pilot_start_assigned_learning_v1', {
    actor_id: input.actorId,
    operation_id: input.operationId,
    payload_hash: input.payloadHash,
    assignment_id: input.assignmentId,
  });
  if (response.error) return { error: 'temporarily-unavailable' };
  return decodeAssignedStart(response.data) ?? { error: 'temporarily-unavailable' };
}
