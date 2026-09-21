import { expect } from 'vitest';
import type { DbHarness } from './helpers';

// Compare the whole learner/session outcome, including receipts and profile
// rewards, rather than only the number of attempts. Synthetic actors only.
export async function learningFacts(db: DbHarness, actorId: string): Promise<string> {
  return db.scalar<string>(`
    SELECT jsonb_build_object(
      'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE id = $1),
      'sessions', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id), '[]') FROM public.sessions s WHERE user_id = $1),
      'items', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]') FROM public.session_items i
        JOIN public.sessions s ON s.id = i.session_id WHERE s.user_id = $1),
      'attempts', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id), '[]') FROM public.attempts a WHERE user_id = $1),
      'rewards', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id), '[]') FROM public.reward_ledger r WHERE user_id = $1),
      'receipts', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY operation_id), '[]') FROM public.operation_receipts r WHERE actor_id = $1),
      'audit', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id), '[]') FROM public.audit_events a WHERE actor_id = $1)
    )::text`, [actorId]);
}

export async function expectUnchangedLearning(db: DbHarness, actorId: string, before: string): Promise<void> {
  expect(await learningFacts(db, actorId)).toBe(before);
}
