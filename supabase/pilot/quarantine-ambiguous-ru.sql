-- Data-only quarantine, not a schema migration. Project: euypaocjzcqlapfilrak.
-- Exact immutable snapshot preserved; safe to repeat. Original source/answers are not edited.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';
DO $quarantine$
DECLARE current_status TEXT;
BEGIN
  SELECT p.status INTO current_status FROM public.question_publications p
  JOIN public.question_versions v ON v.id=p.question_version_id
  WHERE v.id='f2003cbf-a9f9-46aa-bcd8-56afe4c5e387'::uuid AND v.question_id='32683e42-83b0-437d-92b3-b51f40d7509a'::uuid
    AND v.locale='ru' AND v.content_hash='sha256:417a63d8f8a08f091dc5949b66e8ad533615e354b32f63a08066066e28593f72'
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'quarantine exact snapshot missing or changed'; END IF;
  IF current_status='quarantined' THEN RETURN; END IF;
  IF current_status<>'approved' THEN RAISE EXCEPTION 'quarantine unexpected publication state'; END IF;
  UPDATE public.question_publications SET status='quarantined', updated_at=clock_timestamp()
    WHERE question_version_id='f2003cbf-a9f9-46aa-bcd8-56afe4c5e387'::uuid;
  INSERT INTO public.audit_events(actor_kind,event_type,entity_type,entity_id,operation_id,metadata)
    VALUES('operator','content.version.quarantined.ambiguous-sum','question_version','f2003cbf-a9f9-46aa-bcd8-56afe4c5e387'::uuid,'35db9be7-8b58-4ec8-9888-8755446637bd'::uuid,
      '{"result":"accepted","reason_code":"content-unavailable","count":1,"schema_version":"v1"}'::jsonb);
END;
$quarantine$;
COMMIT;
