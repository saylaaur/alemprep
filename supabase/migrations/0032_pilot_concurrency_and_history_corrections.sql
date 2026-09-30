-- A3 review corrections for the already-applied 0031 pilot boundary.
-- All protection changes are forward-only and preserve historic records.

CREATE OR REPLACE FUNCTION public.reject_approved_program_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  program_state RECORD;
  old_status TEXT;
  new_status TEXT;
BEGIN
  -- Every programme content edit takes the same parent-row locks as programme
  -- approval. Ordering by UUID prevents a move between two programmes from
  -- introducing an inverse lock order.
  FOR program_state IN
    SELECT program.id, program.status
    FROM public.pilot_programs AS program
    JOIN (
      SELECT DISTINCT requested.id
      FROM (VALUES
        (CASE WHEN TG_OP = 'INSERT' THEN NULL::uuid ELSE OLD.program_id END),
        (CASE WHEN TG_OP = 'DELETE' THEN NULL::uuid ELSE NEW.program_id END)
      ) AS requested(id)
      WHERE requested.id IS NOT NULL
    ) AS requested ON requested.id = program.id
    ORDER BY program.id
    FOR UPDATE OF program
  LOOP
    IF TG_OP <> 'INSERT' AND program_state.id = OLD.program_id THEN old_status := program_state.status; END IF;
    IF TG_OP <> 'DELETE' AND program_state.id = NEW.program_id THEN new_status := program_state.status; END IF;
  END LOOP;
  IF old_status IN ('approved', 'retired') OR new_status IN ('approved', 'retired') THEN
    RAISE EXCEPTION 'approved pilot programme items are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_approved_program_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Acquiring the same row lock as the item trigger serializes approval and
  -- content changes. The trigger sees the final committed item set afterwards.
  PERFORM 1 FROM public.pilot_programs WHERE id = OLD.id FOR UPDATE;
  IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
    -- Once approved, programme items cannot be repaired in place. Refuse an
    -- empty or unreviewed set before that boundary becomes permanent.
    IF NOT EXISTS (
      SELECT 1
      FROM public.pilot_program_items AS item
      JOIN public.question_versions AS version ON version.id = item.question_version_id
      JOIN public.question_publications AS publication ON publication.question_version_id = version.id
      WHERE item.program_id = OLD.id
        AND item.locale = version.locale
        AND publication.status = 'approved'
    ) OR EXISTS (
      SELECT 1
      FROM public.pilot_program_items AS item
      LEFT JOIN public.question_versions AS version ON version.id = item.question_version_id
      LEFT JOIN public.question_publications AS publication ON publication.question_version_id = version.id
      WHERE item.program_id = OLD.id
        AND (version.id IS NULL OR item.locale <> version.locale OR publication.status IS DISTINCT FROM 'approved')
    ) THEN
      RAISE EXCEPTION 'pilot programme approval requires reviewed content';
    END IF;
  END IF;
  IF OLD.status = 'retired' THEN
    RAISE EXCEPTION 'retired pilot programmes are immutable';
  END IF;
  IF OLD.status = 'approved' AND (
    NEW.status <> 'retired'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.title_ru IS DISTINCT FROM OLD.title_ru
    OR NEW.title_kk IS DISTINCT FROM OLD.title_kk
    OR NEW.review_ref IS DISTINCT FROM OLD.review_ref
  ) THEN RAISE EXCEPTION 'approved pilot programmes are immutable'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_published_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('published', 'cancelled') THEN
    RAISE EXCEPTION 'published pilot assignments are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    IF NEW.status <> 'cancelled'
      OR (pg_catalog.to_jsonb(NEW) - 'status') IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION 'published pilot assignments are immutable';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'cancelled pilot assignments are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_publish_assignment_v1(
  operation_id UUID, group_id UUID, program_id UUID,
  opens_at TIMESTAMPTZ, due_at TIMESTAMPTZ, closes_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  actor UUID := auth.uid();
  group_row public.school_groups%ROWTYPE;
  actor_membership public.school_memberships%ROWTYPE;
  existing_receipt public.pilot_assignment_receipts%ROWTYPE;
  payload_hash TEXT;
  assignment_id_value UUID;
  participant_count INTEGER;
  inserted_participant_count INTEGER;
  item_total INTEGER;
  item_valid INTEGER;
  safe_result JSONB;
BEGIN
  IF actor IS NULL THEN RETURN jsonb_build_object('error', 'unauthenticated'); END IF;
  IF operation_id IS NULL OR group_id IS NULL OR program_id IS NULL OR opens_at IS NULL OR due_at IS NULL OR closes_at IS NULL
    OR opens_at > due_at OR due_at > closes_at OR closes_at > opens_at + interval '90 days' THEN
    RETURN jsonb_build_object('error', 'invalid-input');
  END IF;
  payload_hash := public.pilot_hash_v1(group_id::text || ':' || program_id::text || ':' || opens_at::text || ':' || due_at::text || ':' || closes_at::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':' || operation_id::text, 0));
  SELECT * INTO existing_receipt FROM public.pilot_assignment_receipts AS receipt_row
    WHERE receipt_row.actor_id = actor AND receipt_row.operation_id = pilot_publish_assignment_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.payload_hash = payload_hash THEN RETURN existing_receipt.result; END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;
  SELECT target_group.* INTO group_row FROM public.school_groups AS target_group
    JOIN public.schools AS target_school ON target_school.id = target_group.school_id
    WHERE target_group.id = pilot_publish_assignment_v1.group_id
      AND target_group.status = 'active' AND target_school.status = 'active'
    FOR UPDATE OF target_group, target_school;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  SELECT * INTO actor_membership FROM public.school_memberships AS membership
  WHERE membership.school_id = group_row.school_id AND membership.user_id = actor
    AND membership.ended_at IS NULL AND membership.role IN ('teacher', 'coordinator') FOR UPDATE;
  IF NOT FOUND OR (
    actor_membership.role = 'teacher' AND NOT EXISTS (
      SELECT 1 FROM public.group_teachers AS teacher_group
      WHERE teacher_group.group_id = group_row.id AND teacher_group.school_id = group_row.school_id
        AND teacher_group.school_membership_id = actor_membership.id AND teacher_group.ended_at IS NULL
    )
  ) THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pilot_programs AS program WHERE program.id = pilot_publish_assignment_v1.program_id AND program.status = 'approved') THEN
    RETURN jsonb_build_object('error', 'content-unavailable');
  END IF;
  SELECT count(*)::integer, count(*) FILTER (
    WHERE item.locale = 'ru' AND item.purpose = 'practice' AND version.locale = 'ru' AND publication.status = 'approved'
  )::integer INTO item_total, item_valid
  FROM public.pilot_program_items AS item
  JOIN public.question_versions AS version ON version.id = item.question_version_id
  LEFT JOIN public.question_publications AS publication ON publication.question_version_id = version.id
  WHERE item.program_id = pilot_publish_assignment_v1.program_id;
  IF item_total = 0 OR item_total <> item_valid THEN RETURN jsonb_build_object('error', 'content-unavailable'); END IF;

  -- A snapshot has one locked source set. A concurrent membership revocation
  -- waits until the matching participant rows have been committed or rolled back.
  PERFORM 1
  FROM public.group_memberships AS group_membership
  JOIN public.school_memberships AS membership ON membership.id = group_membership.school_membership_id
    AND membership.school_id = group_membership.school_id
  WHERE group_membership.group_id = group_row.id AND group_membership.school_id = group_row.school_id
    AND group_membership.ended_at IS NULL AND membership.ended_at IS NULL AND membership.role = 'student'
  FOR UPDATE OF group_membership, membership;
  SELECT count(*)::integer INTO participant_count
  FROM public.group_memberships AS group_membership
  JOIN public.school_memberships AS membership ON membership.id = group_membership.school_membership_id
    AND membership.school_id = group_membership.school_id
  WHERE group_membership.group_id = group_row.id AND group_membership.school_id = group_row.school_id
    AND group_membership.ended_at IS NULL AND membership.ended_at IS NULL AND membership.role = 'student';
  IF participant_count = 0 THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  INSERT INTO public.assignments (school_id, group_id, program_id, opens_at, due_at, closes_at, created_by_membership_id)
  VALUES (group_row.school_id, group_row.id, program_id, opens_at, due_at, closes_at, actor_membership.id)
  RETURNING id INTO assignment_id_value;
  INSERT INTO public.assignment_participants (assignment_id, school_id, user_id, school_membership_id)
  SELECT assignment_id_value, group_row.school_id, membership.user_id, membership.id
  FROM public.group_memberships AS group_membership
  JOIN public.school_memberships AS membership ON membership.id = group_membership.school_membership_id
    AND membership.school_id = group_membership.school_id
  WHERE group_membership.group_id = group_row.id AND group_membership.school_id = group_row.school_id
    AND group_membership.ended_at IS NULL AND membership.ended_at IS NULL AND membership.role = 'student';
  GET DIAGNOSTICS inserted_participant_count = ROW_COUNT;
  IF inserted_participant_count <> participant_count THEN
    RAISE EXCEPTION 'participant snapshot changed during publication';
  END IF;
  safe_result := jsonb_build_object('assignmentId', assignment_id_value, 'participants', participant_count);
  INSERT INTO public.pilot_assignment_receipts (actor_id, operation_id, payload_hash, result) VALUES (actor, operation_id, payload_hash, safe_result);
  INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, school_id, operation_id, metadata)
  VALUES (actor, 'user', 'assignment.published', 'assignment', assignment_id_value, group_row.school_id, operation_id,
    jsonb_build_object('result', 'accepted', 'reason_code', 'normal', 'count', participant_count, 'schema_version', 'v1'));
  RETURN safe_result;
END;
$$;
