import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createDbHarness } from './helpers';

describe('manual pilot migration recovery', () => {
  it('reapplies 0035 and 0036 without renaming the wrappers or losing permissions', async () => {
    const db = await createDbHarness();
    try {
      const correction = await readFile('supabase/migrations/0035_pilot_learning_binding_corrections.sql', 'utf8');
      await db.execute(correction);
      await db.execute(correction);
      const dashboard = await readFile('supabase/migrations/0036_teacher_self_study_dashboard.sql', 'utf8');
      await db.execute(dashboard);
      await db.execute(dashboard);
      expect(await db.scalar<boolean>(`SELECT has_function_privilege('authenticated',
        'public.pilot_start_assigned_learning_v1(uuid,uuid,text,uuid)', 'EXECUTE')`)).toBe(false);
      expect(await db.scalar<boolean>(`SELECT has_function_privilege('authenticated',
        'public.pilot_teacher_dashboard_v1(uuid)', 'EXECUTE')`)).toBe(true);
      const definition = await db.scalar<string>(`SELECT pg_get_functiondef(
        'public.pilot_start_assigned_learning_v1_0034(uuid,uuid,text,uuid)'::regprocedure)`);
      // The saved original must never become a wrapper that calls itself.
      expect(definition).toContain('INSERT INTO public.sessions');
    } finally {
      // Later forward corrections must remain the final authority after a
      // recovery replay of an older migration.
      const forward = 'supabase/migrations/0037_pilot_recovery_boundary.sql';
      try { await db.execute(await readFile(forward, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await db.close();
    }
  });
});
