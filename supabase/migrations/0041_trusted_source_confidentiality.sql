-- Published legacy sources contain body.correct and explanations. Once a source
-- has an immutable server version, pupils must use issued public DTOs instead.
-- Keep legacy-only practice and the existing editor/service access unchanged.
-- A restrictive policy also survives reapplication of the older permissive policy.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

CREATE OR REPLACE FUNCTION public.question_has_trusted_version_v1(source_question_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.question_versions v WHERE v.question_id = source_question_id
  );
$$;
REVOKE ALL ON FUNCTION public.question_has_trusted_version_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.question_has_trusted_version_v1(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS questions_hide_trusted_sources ON public.questions;
CREATE POLICY questions_hide_trusted_sources ON public.questions
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND is_admin = true)
    OR NOT public.question_has_trusted_version_v1(id)
  );

COMMENT ON FUNCTION public.question_has_trusted_version_v1(UUID) IS
  'Boolean RLS guard only: no answer keys, snapshots or publication data are returned.';
COMMIT;
