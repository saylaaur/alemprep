-- Block 0: read-only schema/privilege evidence, not a migration.
-- Run as the project owner in Supabase SQL Editor. No user rows or keys returned.
-- Effective privileges include inherited and PUBLIC grants; RLS is reported separately.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';

SELECT jsonb_build_object(
  'checked_at_utc', now() AT TIME ZONE 'UTC',
  'database', current_database(),
  'migration_ledger_present', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'session_manifest_column', (
    SELECT jsonb_build_object('type', udt_name, 'nullable', is_nullable)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'question_ids'
  ),
  'session_manifest_constraint', (
    SELECT pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'public.sessions'::regclass
      AND conname = 'sessions_question_ids_count_check'
  ),
  'profile_update_privileges', (
    SELECT jsonb_agg(jsonb_build_object(
      'role', r.rolname, 'column', a.attname,
      'can_update', has_column_privilege(r.oid, a.attrelid, a.attnum, 'UPDATE')
    ) ORDER BY r.rolname, a.attname)
    FROM pg_roles r CROSS JOIN pg_attribute a
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
      AND a.attrelid = 'public.profiles'::regclass AND NOT a.attisdropped
      AND a.attname IN ('is_admin', 'xp', 'current_streak', 'longest_streak',
        'last_active_date', 'streak_freezes', 'last_freeze_used_date', 'locale')
  ),
  'table_privileges_and_rls', (
    SELECT jsonb_agg(jsonb_build_object(
      'role', r.rolname, 'table', c.relname, 'rls_enabled', c.relrowsecurity,
      'select', has_table_privilege(r.oid, c.oid, 'SELECT'),
      'insert', has_table_privilege(r.oid, c.oid, 'INSERT'),
      'update', has_table_privilege(r.oid, c.oid, 'UPDATE'),
      'delete', has_table_privilege(r.oid, c.oid, 'DELETE')
    ) ORDER BY r.rolname, c.relname)
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
      AND n.nspname = 'public'
      AND c.relname IN ('profiles', 'sessions', 'attempts', 'questions', 'contexts')
      AND c.relkind = 'r'
  ),
  'policies', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', tablename, 'policy', policyname, 'roles', roles,
      'command', cmd, 'using', qual, 'check', with_check
    ) ORDER BY tablename, policyname)
    FROM pg_policies WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'sessions', 'attempts', 'questions', 'contexts')
  ),
  'profile_triggers', (
    SELECT jsonb_agg(jsonb_build_object('name', tgname, 'enabled', tgenabled))
    FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
  )
) AS release_evidence;

ROLLBACK;
