-- A3-B: an assigned lesson owns its issued learning session. Browser input can
-- name an assignment only; the service selects the participant and item here.
ALTER TABLE public.sessions
  ADD COLUMN assignment_id UUID REFERENCES public.assignments(id) ON DELETE RESTRICT,
  ADD COLUMN assignment_participant_id UUID REFERENCES public.assignment_participants(id) ON DELETE RESTRICT,
  ADD COLUMN pilot_program_item_id UUID REFERENCES public.pilot_program_items(id) ON DELETE RESTRICT,
  ADD CONSTRAINT sessions_pilot_attribution_all_or_none CHECK (
    (assignment_id IS NULL AND assignment_participant_id IS NULL AND pilot_program_item_id IS NULL)
    OR (assignment_id IS NOT NULL AND assignment_participant_id IS NOT NULL AND pilot_program_item_id IS NOT NULL)
  );

CREATE INDEX sessions_assignment_participant_item_idx
  ON public.sessions (assignment_participant_id, pilot_program_item_id, status);

CREATE TABLE public.pilot_learning_receipts (
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation_id)
);
ALTER TABLE public.pilot_learning_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pilot_learning_receipts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pilot_session_attribution_is_valid()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.assignment_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.assignment_participants participant
    JOIN public.assignments assignment ON assignment.id = participant.assignment_id
    JOIN public.pilot_program_items item ON item.id = NEW.pilot_program_item_id
    WHERE participant.id = NEW.assignment_participant_id
      AND participant.assignment_id = NEW.assignment_id
      AND participant.user_id = NEW.user_id
      AND assignment.id = NEW.assignment_id
      AND item.program_id = assignment.program_id
  ) THEN RAISE EXCEPTION 'invalid pilot session attribution'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sessions_validate_pilot_attribution
  BEFORE INSERT OR UPDATE OF assignment_id, assignment_participant_id, pilot_program_item_id, user_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.pilot_session_attribution_is_valid();

CREATE OR REPLACE FUNCTION public.pilot_start_assigned_learning_v1(
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
    WHERE receipt.actor_id = pilot_start_assigned_learning_v1.actor_id AND receipt.operation_id = pilot_start_assigned_learning_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.payload_hash = pilot_start_assigned_learning_v1.payload_hash THEN RETURN existing_receipt.result; END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;
  SELECT ap.* INTO participant FROM public.assignment_participants AS ap
  WHERE ap.assignment_id = pilot_start_assigned_learning_v1.assignment_id AND ap.user_id = actor_id
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
  SELECT item.* INTO item_row FROM public.pilot_program_items item
  WHERE item.program_id = assignment_row.program_id AND item.locale = 'ru' AND item.purpose = assignment_row.purpose
    AND NOT EXISTS (SELECT 1 FROM public.sessions done WHERE done.assignment_participant_id = participant.id
      AND done.pilot_program_item_id = item.id AND done.status = 'submitted')
  ORDER BY item.position LIMIT 1;
  SELECT count(*)::integer, count(*) FILTER (WHERE session.status = 'submitted')::integer INTO total_steps, completed_steps
  FROM public.pilot_program_items item LEFT JOIN public.sessions session
    ON session.pilot_program_item_id = item.id AND session.assignment_participant_id = participant.id AND session.status = 'submitted'
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
REVOKE ALL ON FUNCTION public.pilot_start_assigned_learning_v1(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_start_assigned_learning_v1(UUID, UUID, TEXT, UUID) TO service_role;
