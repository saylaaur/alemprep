'use server';

import { z } from 'zod';
import { createClient } from './server';
import { joinGroup } from '@/lib/pilot/access';

export async function joinPilotClass(raw: unknown) {
  try { return await joinGroup(raw); }
  catch { return { ok: false as const, error: 'temporarily-unavailable' as const }; }
}

const inviteInput = z.object({ groupId: z.uuid(), operationId: z.uuid() }).strict();
const inviteResult = z.object({
  inviteId: z.uuid(), expiresAt: z.string(), maxUses: z.number().int(), token: z.string().regex(/^[A-Za-z0-9_-]{22,128}$/).nullable(),
}).strict();

export async function createPilotClassInvite(raw: unknown) {
  const parsed = inviteInput.safeParse(raw);
  if (!parsed.success) return { ok: false as const };
  try {
    const client = await createClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return { ok: false as const };
    const { data, error } = await client.rpc('pilot_create_group_invite_v1', {
      operation_id: parsed.data.operationId, group_id: parsed.data.groupId, expires_in_hours: 72, max_uses: 100,
    });
    if (error) return { ok: false as const };
    const result = inviteResult.safeParse(data);
    if (!result.success) return { ok: false as const };
    return { ok: true as const, value: result.data };
  } catch { return { ok: false as const }; }
}
