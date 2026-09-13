import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';

describe('local Supabase RLS baseline', () => {
  let db: DbHarness | undefined;

  afterEach(async () => {
    await db?.close();
    db = undefined;
  });

  it('does not expose another user profile through real REST', async () => {
    db = await createDbHarness();
    const a = await db.actor('profile-reader-a');
    const b = await db.actor('profile-reader-b');

    const response = await db.rest(a, `/profiles?id=eq.${b.id}&select=id`);

    expect(response.status).toBe(200);
    expect(response.data).toEqual([]);
  });

  it('detects a profile leak when local RLS is deliberately disabled', async () => {
    db = await createDbHarness();
    const a = await db.actor('weakened-policy-a');
    const b = await db.actor('weakened-policy-b');
    await db.scalar<string>('ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY');

    try {
      const response = await db.rest(a, `/profiles?id=eq.${b.id}&select=id`);
      expect(response.status).toBe(200);
      expect(response.data).toEqual([{ id: b.id }]);
    } finally {
      await db.scalar<string>('ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY');
    }
  });

  it('does not let a user promote their own profile through real REST', async () => {
    db = await createDbHarness();
    const actor = await db.actor('self-promotion');

    const update = await db.rest(actor, `/profiles?id=eq.${actor.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_admin: true }),
    });
    const profile = await db.rest(actor, `/profiles?id=eq.${actor.id}&select=is_admin`);

    expect(update.status).toBeGreaterThanOrEqual(400);
    expect(profile.data).toEqual([{ is_admin: false }]);
  });
});
