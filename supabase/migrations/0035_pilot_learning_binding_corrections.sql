-- A3-B corrections for the already applied 0034 boundary.
-- Recovery-safe after a partial SQL Editor run. Always run this whole file.
BEGIN;
-- Authority locks follow publication's school/group prefix before locking the
-- programme. A publisher needs a programme FK lock after its school/group
-- lock; taking programme first here creates a deadlock cycle.
CREATE OR REPLACE FUNCTION public.pilot_assignment_is_currently_eligible_v1(target_actor UUID, target_assignment UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  assignment_row public.assignments%ROWTYPE;
  program_row public.pilot_programs%ROWTYPE;
  school_row public.schools%ROWTYPE;
  group_row public.school_groups%ROWTYPE;
  membership_id_value UUID;
  membership_row public.school_memberships%ROWTYPE;
  group_membership_row public.group_memberships%ROWTYPE;
  participant_row public.assignment_participants%ROWTYPE;
BEGIN
  SELECT * INTO assignment_row FROM public.assignments
  WHERE id = target_assignment FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO school_row FROM public.schools
  WHERE id = assignment_row.school_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO group_row FROM public.school_groups
  WHERE id = assignment_row.group_id AND school_id = assignment_row.school_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO program_row FROM public.pilot_programs
  WHERE id = assignment_row.program_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT school_membership_id INTO membership_id_value
  FROM public.assignment_participants
  WHERE assignment_id = assignment_row.id AND user_id = target_actor;
  IF membership_id_value IS NULL THEN RETURN false; END IF;

  SELECT * INTO membership_row FROM public.school_memberships
  WHERE id = membership_id_value AND school_id = assignment_row.school_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO group_membership_row FROM public.group_memberships
  WHERE group_id = assignment_row.group_id AND school_id = assignment_row.school_id
    AND school_membership_id = membership_row.id
    AND ended_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO participant_row FROM public.assignment_participants
  WHERE assignment_id = assignment_row.id AND user_id = target_actor FOR UPDATE;
  IF NOT FOUND OR participant_row.school_id <> assignment_row.school_id
    OR participant_row.school_membership_id <> membership_row.id THEN
    RETURN false;
  END IF;

  RETURN participant_row.withdrawn_at IS NULL
    AND participant_row.eligible_from <= clock_timestamp()
    AND assignment_row.status = 'published'
    AND assignment_row.opens_at <= clock_timestamp()
    AND assignment_row.closes_at > clock_timestamp()
    AND program_row.status = 'approved'
    AND school_row.status = 'active'
    AND group_row.status = 'active'
    AND membership_row.user_id = target_actor
    AND membership_row.role = 'student'
    AND membership_row.ended_at IS NULL
    AND group_membership_row.ended_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_assignment_content_is_available_v1(target_assignment UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  assignment_row public.assignments%ROWTYPE;
  program_row public.pilot_programs%ROWTYPE;
  item_row RECORD;
  item_count INTEGER := 0;
BEGIN
  SELECT * INTO assignment_row FROM public.assignments
  WHERE id = target_assignment FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO program_row FROM public.pilot_programs
  WHERE id = assignment_row.program_id FOR UPDATE;
  IF NOT FOUND OR program_row.status <> 'approved' THEN RETURN false; END IF;

  FOR item_row IN
    SELECT item.locale, item.purpose, version.locale AS version_locale, publication.status AS publication_status
    FROM public.pilot_program_items AS item
    JOIN public.question_versions AS version ON version.id = item.question_version_id
    JOIN public.question_publications AS publication ON publication.question_version_id = version.id
    WHERE item.program_id = program_row.id
    ORDER BY item.position
    FOR SHARE OF publication
  LOOP
    item_count := item_count + 1;
    IF item_row.locale <> 'ru' OR item_row.purpose <> 'practice'
      OR item_row.version_locale <> 'ru' OR item_row.publication_status <> 'approved' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN item_count > 0;
END;
$$;

-- A pilot attribution is the durable link used for reporting. It is written
-- exactly once at issuance: legacy sessions cannot acquire it later, and an
-- issued pilot session cannot be detached or pointed at a different pupil or
-- programme item.
CREATE OR REPLACE FUNCTION public.pilot_session_attribution_is_valid()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.assignment_id IS NOT NULL
    OR OLD.assignment_participant_id IS NOT NULL
    OR OLD.pilot_program_item_id IS NOT NULL
  ) AND (
    NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
    OR NEW.assignment_participant_id IS DISTINCT FROM OLD.assignment_participant_id
    OR NEW.pilot_program_item_id IS DISTINCT FROM OLD.pilot_program_item_id
  ) THEN
    RAISE EXCEPTION 'pilot session attribution is immutable';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.assignment_id IS NULL
    AND NEW.assignment_id IS NOT NULL THEN
    RAISE EXCEPTION 'legacy sessions cannot acquire pilot attribution';
  END IF;

  IF NEW.assignment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.integrity_version IS DISTINCT FROM OLD.integrity_version
      OR NEW.mode IS DISTINCT FROM OLD.mode THEN
      RAISE EXCEPTION 'pilot session integrity and mode are immutable';
    END IF;
    IF OLD.status = 'submitted' AND NEW.status IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'submitted pilot sessions are immutable';
    END IF;
    IF OLD.status = 'active' AND NEW.status = 'submitted' AND (
      NEW.receipt IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.attempts AS accepted_attempt
        WHERE accepted_attempt.session_id = OLD.id AND accepted_attempt.user_id = OLD.user_id
          AND accepted_attempt.integrity_version = 1
      )
    ) THEN
      RAISE EXCEPTION 'pilot completion requires accepted facts';
    END IF;
  END IF;

  IF NEW.integrity_version <> 1 OR NEW.mode::text <> 'practice' THEN
    RAISE EXCEPTION 'invalid pilot session attribution';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.assignment_participants participant
    JOIN public.assignments assignment ON assignment.id = participant.assignment_id
    JOIN public.pilot_program_items item ON item.id = NEW.pilot_program_item_id
    WHERE participant.id = NEW.assignment_participant_id
      AND participant.assignment_id = NEW.assignment_id
      AND participant.user_id = NEW.user_id
      AND participant.school_id = assignment.school_id
      AND item.program_id = assignment.program_id
      AND item.purpose = assignment.purpose
  ) THEN
    RAISE EXCEPTION 'invalid pilot session attribution';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_session_item_is_valid()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE assigned_version_id UUID;
BEGIN
  SELECT program_item.question_version_id INTO assigned_version_id
  FROM public.sessions AS session_row
  JOIN public.pilot_program_items AS program_item ON program_item.id = session_row.pilot_program_item_id
  WHERE session_row.id = NEW.session_id AND session_row.assignment_id IS NOT NULL;

  IF assigned_version_id IS NOT NULL
    AND NEW.question_version_id IS DISTINCT FROM assigned_version_id THEN
    RAISE EXCEPTION 'pilot session item must match its programme item';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sessions_validate_pilot_attribution ON public.sessions;
CREATE TRIGGER sessions_validate_pilot_attribution
  BEFORE INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.pilot_session_attribution_is_valid();

DROP TRIGGER IF EXISTS session_items_validate_pilot_attribution ON public.session_items;
CREATE TRIGGER session_items_validate_pilot_attribution
  BEFORE INSERT OR UPDATE OF session_id, question_version_id ON public.session_items
  FOR EACH ROW EXECUTE FUNCTION public.pilot_session_item_is_valid();

-- An expired session may be replaced, but a participant can never have two
-- usable or accepted facts for the same programme item.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_assignment_participant_item_live_unique
  ON public.sessions (assignment_participant_id, pilot_program_item_id)
  WHERE assignment_participant_id IS NOT NULL
    AND pilot_program_item_id IS NOT NULL
    AND status IN ('active', 'submitted');

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.pilot_start_assigned_learning_v1_0034(uuid,uuid,text,uuid)') IS NULL THEN
    ALTER FUNCTION public.pilot_start_assigned_learning_v1(UUID, UUID, TEXT, UUID)
      RENAME TO pilot_start_assigned_learning_v1_0034;
  END IF;
END;
$$;

-- Renaming a PL/pgSQL function does not rewrite the implicit parameter block
-- label used in its stored body. Preserve the original implementation while
-- qualifying its arguments with the new name (same pattern as migration 0028).
DO $$
DECLARE original_definition TEXT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.pilot_start_assigned_learning_v1_0034(uuid, uuid, text, uuid)'::pg_catalog.regprocedure
  ) INTO original_definition;
  EXECUTE replace(original_definition,
    'pilot_start_assigned_learning_v1.', 'pilot_start_assigned_learning_v1_0034.');
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_start_assigned_learning_v1(actor_id UUID, operation_id UUID, payload_hash TEXT, assignment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result JSONB;
BEGIN
  IF actor_id IS NULL OR operation_id IS NULL OR assignment_id IS NULL OR payload_hash IS NULL OR payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.pilot_assignment_is_currently_eligible_v1(actor_id, assignment_id) THEN
    RETURN jsonb_build_object('error', 'not-found');
  END IF;
  IF NOT public.pilot_assignment_content_is_available_v1(assignment_id) THEN
    RETURN jsonb_build_object('error', 'content-unavailable');
  END IF;
  result := public.pilot_start_assigned_learning_v1_0034(actor_id, operation_id, payload_hash, assignment_id);
  -- 0034 stored the newly-created session item in one branch but omitted it
  -- on active reuse. The public contract identifies only the session; callers
  -- hydrate its item from the durable server-side rows.
  RETURN result - 'sessionItemId';
END;
$$;

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.commit_learning_v1_pre_pilot_binding(uuid,uuid,text,uuid,jsonb,text)') IS NULL THEN
    ALTER FUNCTION public.commit_learning_v1(UUID, UUID, TEXT, UUID, JSONB, TEXT)
      RENAME TO commit_learning_v1_pre_pilot_binding;
  END IF;
END;
$$;

DO $$
DECLARE original_definition TEXT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.commit_learning_v1_pre_pilot_binding(uuid, uuid, text, uuid, jsonb, text)'::pg_catalog.regprocedure
  ) INTO original_definition;
  EXECUTE replace(original_definition,
    'commit_learning_v1.', 'commit_learning_v1_pre_pilot_binding.');
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_learning_v1(actor_id UUID, operation_id UUID, payload_hash TEXT, session_id UUID, graded_items JSONB, scoring_version TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  existing_receipt public.operation_receipts%ROWTYPE;
  observed_session public.sessions%ROWTYPE;
  learning_session public.sessions%ROWTYPE;
  assigned_version_id UUID;
  matching_item_count INTEGER;
  other_item_count INTEGER;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  PERFORM pg_catalog.set_config('statement_timeout', '5s', true);
  IF actor_id IS NULL OR operation_id IS NULL OR session_id IS NULL OR payload_hash IS NULL OR char_length(payload_hash) = 0 OR scoring_version IS NULL THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || ':' || operation_id::text, 0));

  -- Generic learning submission takes profile before session. Keep that prefix
  -- before any pilot authority lock, otherwise an assigned submit can cycle
  -- with the existing rewards transaction.
  PERFORM 1 FROM public.profiles WHERE id = actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO existing_receipt FROM public.operation_receipts receipt WHERE receipt.actor_id = commit_learning_v1.actor_id AND receipt.operation_id = commit_learning_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.kind = 'learning.submit' AND existing_receipt.payload_hash = commit_learning_v1.payload_hash THEN RETURN existing_receipt.result; END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;

  -- Read only the stable identity needed to lock the assignment scope. The
  -- subsequent FOR UPDATE re-reads the session before the grader sees it.
  SELECT * INTO observed_session FROM public.sessions WHERE id = commit_learning_v1.session_id;
  IF NOT FOUND OR observed_session.user_id <> actor_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF observed_session.assignment_id IS NOT NULL
    AND NOT public.pilot_assignment_is_currently_eligible_v1(actor_id, observed_session.assignment_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO learning_session FROM public.sessions WHERE id = commit_learning_v1.session_id FOR UPDATE;
  IF NOT FOUND OR learning_session.user_id <> actor_id
    OR learning_session.assignment_id IS DISTINCT FROM observed_session.assignment_id
    OR learning_session.assignment_participant_id IS DISTINCT FROM observed_session.assignment_participant_id
    OR learning_session.pilot_program_item_id IS DISTINCT FROM observed_session.pilot_program_item_id THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;

  IF learning_session.assignment_id IS NOT NULL THEN
    SELECT item.question_version_id INTO assigned_version_id
    FROM public.assignment_participants AS participant
    JOIN public.assignments AS assignment ON assignment.id = participant.assignment_id
    JOIN public.pilot_program_items AS item ON item.id = learning_session.pilot_program_item_id
    WHERE participant.id = learning_session.assignment_participant_id
      AND participant.assignment_id = learning_session.assignment_id
      AND participant.user_id = actor_id
      AND participant.school_id = assignment.school_id
      AND item.program_id = assignment.program_id
      AND item.purpose = assignment.purpose;
    IF assigned_version_id IS NULL THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;

    SELECT count(*) FILTER (WHERE question_version_id = assigned_version_id)::integer,
      count(*) FILTER (WHERE question_version_id <> assigned_version_id)::integer
    INTO matching_item_count, other_item_count
    FROM public.session_items AS issued_item WHERE issued_item.session_id = learning_session.id;
    IF matching_item_count <> 1 OR other_item_count <> 0 THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN public.commit_learning_v1_pre_pilot_binding(actor_id, operation_id, payload_hash, session_id, graded_items, scoring_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_audit_assigned_learning_start_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE school_id_value UUID;
BEGIN
  IF NEW.assignment_id IS NOT NULL THEN
    SELECT school_id INTO school_id_value FROM public.assignments WHERE id = NEW.assignment_id;
    INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, school_id, operation_id, metadata)
    VALUES (NEW.user_id, 'user', 'pilot.learning_started', 'session', NEW.id, school_id_value, NEW.operation_id,
      jsonb_build_object('result','started','reason_code','normal','count',1,'schema_version','v1'));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sessions_audit_assigned_learning_start ON public.sessions;
CREATE TRIGGER sessions_audit_assigned_learning_start AFTER INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.pilot_audit_assigned_learning_start_v1();

REVOKE ALL ON FUNCTION public.pilot_assignment_is_currently_eligible_v1(UUID, UUID), public.pilot_assignment_content_is_available_v1(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_start_assigned_learning_v1_0034(UUID, UUID, TEXT, UUID), public.commit_learning_v1_pre_pilot_binding(UUID, UUID, TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_start_assigned_learning_v1(UUID, UUID, TEXT, UUID), public.commit_learning_v1(UUID, UUID, TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_start_assigned_learning_v1(UUID, UUID, TEXT, UUID), public.commit_learning_v1(UUID, UUID, TEXT, UUID, JSONB, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
