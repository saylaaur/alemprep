import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';

let db: DbHarness;

beforeAll(async () => { db = await createDbHarness(); });
afterAll(async () => { await db?.close(); });

describe('profile trigger privileges', () => {
  it('keeps both functions out of the client RPC surface and pins their search paths', async () => {
    const exposed = await db.scalar<number>(`
      SELECT count(*)::int FROM pg_proc
      WHERE oid IN ('public.handle_new_user()'::regprocedure, 'public.handle_updated_at()'::regprocedure)
        AND (has_function_privilege('anon', oid, 'EXECUTE')
          OR has_function_privilege('authenticated', oid, 'EXECUTE')
          OR proconfig IS NULL
          OR NOT ('search_path=""' = ANY(proconfig)))
    `);
    expect(exposed).toBe(0);
  });

  it('still creates profiles and updates their timestamp on an ordinary locale change', async () => {
    const pupil = await db.actor('profile-trigger');
    const original = await db.scalar<string>('SELECT updated_at::text FROM public.profiles WHERE id = $1', [pupil.id]);
    expect(original).toBeTruthy();

    const updated = await db.rest(pupil, `/profiles?id=eq.${pupil.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ locale: 'kk' }),
    });
    expect(updated).toMatchObject({ status: 200, data: [expect.objectContaining({ locale: 'kk' })] });
    expect(await db.scalar<boolean>(
      'SELECT updated_at > $2::timestamptz FROM public.profiles WHERE id = $1',
      [pupil.id, original],
    )).toBe(true);
  });
});
