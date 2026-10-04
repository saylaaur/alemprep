-- Forward correction for active state/recovery and accepted pilot progress.
-- 0034 stays byte-identical. Run after the recovery-safe 0035 and 0036.
BEGIN;

CREATE OR REPLACE FUNCTION public.pilot_session_has_accepted_completion_v1(target_session UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.session_items item ON item.session_id = s.id
    JOIN public.question_versions v ON v.id = item.question_version_id
    JOIN public.pilot_program_items program_item ON program_item.id = s.pilot_program_item_id
      AND program_item.question_version_id = v.id
    JOIN public.attempts a ON a.session_id = s.id AND a.session_item_id = item.id
      AND a.user_id = s.user_id AND a.question_id = v.question_id
    WHERE s.id = target_session AND s.integrity_version = 1 AND s.mode = 'practice'
      AND s.status = 'submitted' AND s.receipt IS NOT NULL
      AND s.receipt->>'sessionId' = s.id::text AND a.integrity_version = 1
      AND (SELECT count(*) FROM public.session_items WHERE session_id = s.id) = 1
      AND EXISTS (SELECT 1 FROM public.operation_receipts r WHERE r.actor_id = s.user_id
        AND r.kind = 'learning.submit' AND r.result = s.receipt)
  );
$$;

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

  IF TG_OP = 'INSERT' AND NEW.status <> 'active' THEN
    RAISE EXCEPTION 'pilot sessions must be issued active';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.integrity_version IS DISTINCT FROM OLD.integrity_version
      OR NEW.mode IS DISTINCT FROM OLD.mode THEN
      RAISE EXCEPTION 'pilot session integrity and mode are immutable';
    END IF;
    IF OLD.status = 'submitted' AND NEW.status IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'submitted pilot sessions are immutable';
    END IF;
    IF NEW.status = 'submitted' AND (
      TG_OP = 'INSERT' OR NEW.receipt IS NULL
      OR NEW.receipt->>'sessionId' IS DISTINCT FROM NEW.id::text OR NOT EXISTS (
        SELECT 1 FROM public.attempts AS accepted_attempt
        JOIN public.session_items issued ON issued.id = accepted_attempt.session_item_id
          AND issued.session_id = NEW.id
        JOIN public.question_versions version ON version.id = issued.question_version_id
          AND version.question_id = accepted_attempt.question_id
        JOIN public.pilot_program_items program_item ON program_item.id = NEW.pilot_program_item_id
          AND program_item.question_version_id = version.id
        WHERE accepted_attempt.session_id = NEW.id AND accepted_attempt.user_id = NEW.user_id
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

CREATE OR REPLACE FUNCTION public.pilot_start_assigned_learning_v1_0034(
  actor_id UUID, operation_id UUID, payload_hash TEXT, assignment_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  participant public.assignment_participants%ROWTYPE;
  assignment_row public.assignments%ROWTYPE;
  item_row public.pilot_program_items%ROWTYPE;
  version_row public.question_versions%ROWTYPE;
  existing_receipt public.pilot_learning_receipts%ROWTYPE;
  active_session public.sessions%ROWTYPE;
  session_id_value UUID;
  session_item_id UUID;
  total_steps INTEGER;
  completed_steps INTEGER;
  expires_at_value TIMESTAMPTZ;
  manifest_hash_value TEXT;
  result JSONB;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  IF actor_id IS NULL OR operation_id IS NULL OR assignment_id IS NULL OR payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || ':' || operation_id::text, 0));
  SELECT * INTO existing_receipt FROM public.pilot_learning_receipts receipt
    WHERE receipt.actor_id = pilot_start_assigned_learning_v1_0034.actor_id AND receipt.operation_id = pilot_start_assigned_learning_v1_0034.operation_id;
  IF FOUND THEN
    IF existing_receipt.payload_hash = pilot_start_assigned_learning_v1_0034.payload_hash THEN RETURN existing_receipt.result; END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;
  SELECT ap.* INTO participant FROM public.assignment_participants AS ap
  WHERE ap.assignment_id = pilot_start_assigned_learning_v1_0034.assignment_id AND ap.user_id = actor_id
    AND ap.withdrawn_at IS NULL AND ap.eligible_from <= clock_timestamp()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  SELECT * INTO assignment_row FROM public.assignments WHERE id = participant.assignment_id;
  IF assignment_row.status <> 'published' OR assignment_row.opens_at > clock_timestamp() OR assignment_row.closes_at <= clock_timestamp()
    OR NOT EXISTS (
      SELECT 1 FROM public.school_groups AS group_row
      JOIN public.schools AS school ON school.id = group_row.school_id
      JOIN public.school_memberships AS membership ON membership.id = participant.school_membership_id
      WHERE group_row.id = assignment_row.group_id AND group_row.school_id = assignment_row.school_id
        AND group_row.status = 'active' AND school.status = 'active'
        AND membership.user_id = actor_id AND membership.role = 'student' AND membership.ended_at IS NULL
    ) THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  UPDATE public.sessions SET status = 'expired'
    WHERE assignment_participant_id = participant.id AND status = 'active' AND expires_at <= clock_timestamp();
  -- Fail closed on historical inconsistent rows; never report a forged
  -- status as completion or silently delete/rewrite historical facts.
  IF EXISTS (SELECT 1 FROM public.sessions suspect
    WHERE suspect.assignment_participant_id = participant.id AND suspect.status = 'submitted'
      AND NOT public.pilot_session_has_accepted_completion_v1(suspect.id)) THEN
    RETURN jsonb_build_object('error', 'temporarily-unavailable');
  END IF;
  SELECT item.* INTO item_row FROM public.pilot_program_items item
  WHERE item.program_id = assignment_row.program_id AND item.locale = 'ru' AND item.purpose = assignment_row.purpose
    AND NOT EXISTS (SELECT 1 FROM public.sessions done WHERE done.assignment_participant_id = participant.id
      AND done.pilot_program_item_id = item.id AND public.pilot_session_has_accepted_completion_v1(done.id))
  ORDER BY item.position LIMIT 1;
  SELECT count(*)::integer, count(*) FILTER (WHERE public.pilot_session_has_accepted_completion_v1(session.id))::integer INTO total_steps, completed_steps
  FROM public.pilot_program_items item LEFT JOIN public.sessions session
    ON session.pilot_program_item_id = item.id AND session.assignment_participant_id = participant.id AND public.pilot_session_has_accepted_completion_v1(session.id)
  WHERE item.program_id = assignment_row.program_id AND item.locale = 'ru' AND item.purpose = assignment_row.purpose;
  IF item_row.id IS NULL THEN
    result := jsonb_build_object('status', 'completed', 'totalSteps', total_steps, 'completedSteps', completed_steps);
    INSERT INTO public.pilot_learning_receipts VALUES (actor_id, operation_id, payload_hash, result);
    RETURN result;
  END IF;
  SELECT * INTO active_session FROM public.sessions session
    WHERE session.assignment_participant_id = participant.id AND session.pilot_program_item_id = item_row.id AND session.status = 'active'
    ORDER BY session.started_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    result := jsonb_build_object('status', 'active', 'sessionId', active_session.id, 'totalSteps', total_steps, 'completedSteps', completed_steps);
  ELSE
    SELECT * INTO version_row FROM public.question_versions WHERE id = item_row.question_version_id;
    expires_at_value := least(assignment_row.closes_at, clock_timestamp() + interval '2 hours');
    manifest_hash_value := 'sha256:' || pg_catalog.encode(extensions.digest(pg_catalog.convert_to(version_row.id::text || ':' || version_row.content_hash, 'UTF8'), 'sha256'), 'hex');
    INSERT INTO public.sessions (user_id, topic_id, subject_id, mode, total_questions, question_ids, integrity_version, operation_id, status, expires_at, scoring_version, manifest_hash, assignment_id, assignment_participant_id, pilot_program_item_id)
    SELECT actor_id, question.topic_id, topic.subject_id, 'practice', 1, ARRAY[version_row.question_id], 1, operation_id, 'active', expires_at_value, 'ent-v1', manifest_hash_value, assignment_row.id, participant.id, item_row.id
    FROM public.questions question JOIN public.topics topic ON topic.id = question.topic_id WHERE question.id = version_row.question_id
    RETURNING id INTO session_id_value;
    INSERT INTO public.session_items (session_id, question_version_id, position) VALUES (session_id_value, version_row.id, 0) RETURNING id INTO session_item_id;
    result := jsonb_build_object('status', 'active', 'sessionId', session_id_value, 'sessionItemId', session_item_id, 'totalSteps', total_steps, 'completedSteps', completed_steps);
  END IF;
  INSERT INTO public.pilot_learning_receipts VALUES (actor_id, operation_id, payload_hash, result);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_start_assigned_learning_v1(actor_id UUID, operation_id UUID, payload_hash TEXT, assignment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result JSONB;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  PERFORM pg_catalog.set_config('statement_timeout', '5s', true);
  IF actor_id IS NULL OR operation_id IS NULL OR assignment_id IS NULL OR payload_hash IS NULL OR payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  -- Both start and commit use operation -> assignment authority order.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || ':' || operation_id::text, 0));
  IF NOT public.pilot_assignment_is_currently_eligible_v1(actor_id, assignment_id) THEN
    RETURN jsonb_build_object('error', 'not-found');
  END IF;
  IF NOT public.pilot_assignment_content_is_available_v1(assignment_id) THEN
    RETURN jsonb_build_object('error', 'content-unavailable');
  END IF;
  -- Validate historical facts before replaying an old start receipt too.
  IF EXISTS (SELECT 1 FROM public.sessions suspect
    WHERE suspect.assignment_id = pilot_start_assigned_learning_v1.assignment_id
      AND suspect.user_id = actor_id AND suspect.status = 'submitted'
      AND NOT public.pilot_session_has_accepted_completion_v1(suspect.id)) THEN
    RETURN jsonb_build_object('error', 'temporarily-unavailable');
  END IF;
  result := public.pilot_start_assigned_learning_v1_0034(actor_id, operation_id, payload_hash, assignment_id);
  -- 0034 stored the newly-created session item in one branch but omitted it
  -- on active reuse. The public contract identifies only the session; callers
  -- hydrate its item from the durable server-side rows.
  RETURN result - 'sessionItemId';
END;
$$;

-- Only the server Auth boundary may pass an actor. Grading/replay retains its
-- separate historical reader; this guard gates active public reload only.
CREATE OR REPLACE FUNCTION public.learning_active_session_access_v1(actor_id UUID, session_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE owned public.sessions%ROWTYPE;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  PERFORM pg_catalog.set_config('statement_timeout', '5s', true);
  SELECT * INTO owned FROM public.sessions s WHERE s.id = session_id
    AND s.user_id = actor_id AND s.integrity_version = 1 AND s.status = 'active';
  IF NOT FOUND OR owned.expires_at <= clock_timestamp() THEN RETURN false; END IF;
  IF owned.assignment_id IS NOT NULL AND (
    NOT public.pilot_assignment_is_currently_eligible_v1(actor_id, owned.assignment_id)
    OR NOT public.pilot_assignment_content_is_available_v1(owned.assignment_id)
  ) THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.session_items WHERE session_items.session_id = owned.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.session_items item
      LEFT JOIN public.question_publications publication ON publication.question_version_id = item.question_version_id
      WHERE item.session_id = owned.id AND publication.status IS DISTINCT FROM 'approved'
    );
END;
$$;
REVOKE ALL ON FUNCTION public.learning_active_session_access_v1(UUID, UUID),
  public.pilot_session_has_accepted_completion_v1(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.learning_active_session_access_v1(UUID, UUID),
  public.pilot_session_has_accepted_completion_v1(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.pilot_start_assigned_learning_v1_0034(UUID, UUID, TEXT, UUID),
  public.pilot_start_assigned_learning_v1(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_start_assigned_learning_v1(UUID, UUID, TEXT, UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
