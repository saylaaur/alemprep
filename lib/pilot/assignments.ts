import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { LearningError, Result } from '@/lib/learning/contracts';
import { parsePublishAssignmentInput, type PublishAssignmentResult } from './contracts';

const rpcResult = z.union([
  z.object({ assignmentId: z.uuid(), participants: z.number().int().nonnegative() }).strict(),
  z.object({
    error: z.enum(['unauthenticated', 'forbidden', 'invalid-input', 'not-found', 'content-unavailable', 'operation-conflict']),
  }).strict(),
]);

function failure(error: LearningError): Result<never> {
  return { ok: false, error, requestId: randomUUID() };
}

/** Publish one fixed RU practice assignment; membership and content are DB-owned. */
export async function publishPilotAssignment(raw: unknown): Promise<Result<PublishAssignmentResult>> {
  const input = parsePublishAssignmentInput(raw);
  if (!input) return failure('invalid-input');

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return failure('unauthenticated');

  const { data, error } = await supabase.rpc('pilot_publish_assignment_v1', {
    operation_id: input.operationId,
    group_id: input.groupId,
    program_id: input.programId,
    opens_at: input.opensAt,
    due_at: input.dueAt,
    closes_at: input.closesAt,
  });
  if (error) return failure('temporarily-unavailable');

  const parsed = rpcResult.safeParse(data);
  if (!parsed.success) return failure('temporarily-unavailable');
  if ('error' in parsed.data) return failure(parsed.data.error);
  return { ok: true, value: parsed.data };
}
