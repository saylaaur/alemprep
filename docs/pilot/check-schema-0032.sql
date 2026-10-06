-- Read-only catalog comparison for code c47385b, not a migration or a pilot admission test.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL search_path = public, pg_catalog;
WITH functions AS (
 SELECT p.*, pg_get_function_identity_arguments(p.oid) AS args
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE 'pilot_%' OR p.proname IN (
 'start_learning_v1','commit_learning_v1','commit_learning_v1_l02a',
 'reject_approved_program_item_mutation','reject_approved_program_mutation',
 'reject_published_assignment_mutation','reject_non_student_group_membership','reject_non_teacher_group_assignment'))
), pilot_tables AS (
 SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN (
 'schools','school_memberships','school_groups','group_memberships','group_teachers','group_invites',
 'pilot_operation_receipts','pilot_programs','pilot_program_items','assignments','assignment_participants',
 'pilot_assignment_receipts','pilot_provision_receipts')
)
SELECT
 (SELECT count(*) FROM functions) AS function_count,
 (SELECT md5(string_agg(proname || '(' || args || ')' || prosrc || prosecdef::text || coalesce(proconfig::text,'') ||
 has_function_privilege('anon',oid,'EXECUTE')::text || has_function_privilege('authenticated',oid,'EXECUTE')::text ||
 has_function_privilege('service_role',oid,'EXECUTE')::text, E'\n' ORDER BY proname,args)) FROM functions) AS function_fingerprint,
 (SELECT count(*) FROM pilot_tables) AS pilot_table_count,
 (SELECT md5(string_agg(relname || relrowsecurity::text ||
 has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')::text ||
 has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')::text,
 E'\n' ORDER BY relname)) FROM pilot_tables) AS table_access_fingerprint,
 (SELECT md5(string_agg(c.relname || t.tgname || t.tgenabled::text || pg_get_triggerdef(t.oid), E'\n' ORDER BY c.relname,t.tgname))
 FROM pg_trigger t JOIN pilot_tables c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal) AS trigger_fingerprint;
ROLLBACK;
