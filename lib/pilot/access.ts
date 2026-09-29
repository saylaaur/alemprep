import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { LearningError, Result } from '@/lib/learning/contracts';
import { parseJoinInput, type JoinGroupResult } from './contracts';

const rpcResult = z.union([
  z.object({ groupId: z.uuid() }).strict(),
  z.object({
    error: z.enum([
      'unauthenticated',
      'forbidden',
      'invalid-input',
      'not-found',
      'expired',
      'operation-conflict',
    ]),
  }).strict(),
]);

function failure(error: LearningError): Result<never> {
  return { ok: false, error, requestId: randomUUID() };
}

/** Authenticated join path; the database derives actor and school scope. */
export async function joinGroup(raw: unknown): Promise<Result<JoinGroupResult>> {
  const input = parseJoinInput(raw);
  if (!input) return failure('invalid-input');

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return failure('unauthenticated');

  const { data, error } = await supabase.rpc('pilot_join_group_v1', {
    operation_id: input.operationId,
    token: input.token,
  });
  if (error) return failure('temporarily-unavailable');

  const parsed = rpcResult.safeParse(data);
  if (!parsed.success) return failure('temporarily-unavailable');
  if ('error' in parsed.data) return failure(parsed.data.error);
  return { ok: true, value: parsed.data };
}
