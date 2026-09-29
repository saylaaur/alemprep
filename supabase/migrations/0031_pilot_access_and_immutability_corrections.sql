-- A3 review corrections.  This is deliberately a forward migration: the
-- initially applied school boundary migration is never rewritten in place.

CREATE UNIQUE INDEX school_memberships_one_active_student_user
  ON public.school_memberships (user_id)
  WHERE ended_at IS NULL AND role = 'student';

CREATE OR REPLACE FUNCTION public.reject_non_student_group_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  membership_role TEXT;
  membership_ended_at TIMESTAMPTZ;
BEGIN
  SELECT role, ended_at INTO membership_role, membership_ended_at
  FROM public.school_memberships
  WHERE id = NEW.school_membership_id AND school_id = NEW.school_id;
  IF membership_role IS DISTINCT FROM 'student' OR membership_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'only active student memberships can join a school group';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER group_memberships_require_active_student
  BEFORE INSERT OR UPDATE OF school_id, school_membership_id ON public.group_memberships
  FOR EACH ROW EXECUTE FUNCTION public.reject_non_student_group_membership();

CREATE OR REPLACE FUNCTION public.reject_non_teacher_group_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  membership_role TEXT;
  membership_ended_at TIMESTAMPTZ;
BEGIN
  SELECT role, ended_at INTO membership_role, membership_ended_at
  FROM public.school_memberships
  WHERE id = NEW.school_membership_id AND school_id = NEW.school_id;
  IF membership_role NOT IN ('teacher', 'coordinator') OR membership_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'only active teacher or coordinator memberships can manage a school group';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER group_teachers_require_active_teacher
  BEFORE INSERT OR UPDATE OF school_id, school_membership_id ON public.group_teachers
  FOR EACH ROW EXECUTE FUNCTION public.reject_non_teacher_group_assignment();

CREATE OR REPLACE FUNCTION public.pilot_create_group_invite_v1(
  operation_id UUID,
  group_id UUID,
  expires_in_hours INTEGER,
  max_uses INTEGER
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
  existing_receipt public.pilot_operation_receipts%ROWTYPE;
  payload_hash TEXT;
  raw_token TEXT;
  invite_id UUID;
  created_at_value TIMESTAMPTZ;
  expires_at_value TIMESTAMPTZ;
  safe_result JSONB;
BEGIN
  IF actor IS NULL THEN RETURN jsonb_build_object('error', 'unauthenticated'); END IF;
  IF operation_id IS NULL OR group_id IS NULL OR expires_in_hours NOT IN (24, 72) OR max_uses NOT BETWEEN 1 AND 100 THEN
    RETURN jsonb_build_object('error', 'invalid-input');
  END IF;
  payload_hash := public.pilot_hash_v1(group_id::text || ':' || expires_in_hours::text || ':' || max_uses::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':' || operation_id::text, 0));
  SELECT * INTO existing_receipt FROM public.pilot_operation_receipts AS receipt_row
    WHERE receipt_row.actor_id = actor AND receipt_row.operation_id = pilot_create_group_invite_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.kind = 'pilot.invite' AND existing_receipt.payload_hash = payload_hash THEN
      RETURN existing_receipt.result || jsonb_build_object('token', NULL);
    END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;

  SELECT target_group.* INTO group_row FROM public.school_groups AS target_group
    JOIN public.schools AS target_school ON target_school.id = target_group.school_id
    WHERE target_group.id = pilot_create_group_invite_v1.group_id
      AND target_group.status = 'active' AND target_school.status = 'active'
    FOR UPDATE OF target_group, target_school;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  SELECT * INTO actor_membership FROM public.school_memberships AS membership
    WHERE membership.school_id = group_row.school_id AND membership.user_id = actor
      AND membership.ended_at IS NULL AND membership.role IN ('teacher', 'coordinator')
    FOR UPDATE;
  IF NOT FOUND OR (
    actor_membership.role = 'teacher' AND NOT EXISTS (
      SELECT 1 FROM public.group_teachers AS teacher_group
      WHERE teacher_group.group_id = group_row.id AND teacher_group.school_id = group_row.school_id
        AND teacher_group.school_membership_id = actor_membership.id AND teacher_group.ended_at IS NULL
    )
  ) THEN RETURN jsonb_build_object('error', 'not-found'); END IF;

  raw_token := replace(translate(pg_catalog.encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=', '');
  created_at_value := clock_timestamp();
  expires_at_value := created_at_value + make_interval(hours => expires_in_hours);
  INSERT INTO public.group_invites (school_id, group_id, token_hash, expires_at, max_uses, created_by_membership_id, created_at)
  VALUES (group_row.school_id, group_row.id, public.pilot_hash_v1(raw_token), expires_at_value, max_uses, actor_membership.id, created_at_value)
  RETURNING id INTO invite_id;
  safe_result := jsonb_build_object('inviteId', invite_id, 'expiresAt', expires_at_value, 'maxUses', max_uses);
  INSERT INTO public.pilot_operation_receipts (actor_id, operation_id, kind, payload_hash, result)
  VALUES (actor, operation_id, 'pilot.invite', payload_hash, safe_result);
  INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, school_id, operation_id, metadata)
  VALUES (actor, 'user', 'pilot.invite_created', 'group_invite', invite_id, group_row.school_id, operation_id,
    jsonb_build_object('result', 'accepted', 'reason_code', 'normal', 'count', max_uses, 'schema_version', 'v1'));
  RETURN safe_result || jsonb_build_object('token', raw_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_join_group_v1(operation_id UUID, token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  actor UUID := auth.uid();
  invite_row public.group_invites%ROWTYPE;
  membership_row public.school_memberships%ROWTYPE;
  existing_receipt public.pilot_operation_receipts%ROWTYPE;
  payload_hash TEXT;
  school_status TEXT;
  group_status TEXT;
  safe_result JSONB;
BEGIN
  IF actor IS NULL THEN RETURN jsonb_build_object('error', 'unauthenticated'); END IF;
  IF operation_id IS NULL OR token !~ '^[A-Za-z0-9_-]{22,128}$' THEN RETURN jsonb_build_object('error', 'invalid-input'); END IF;
  payload_hash := public.pilot_hash_v1(token);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':' || operation_id::text, 0));
  SELECT * INTO existing_receipt FROM public.pilot_operation_receipts AS receipt_row
    WHERE receipt_row.actor_id = actor AND receipt_row.operation_id = pilot_join_group_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.kind = 'pilot.join' AND existing_receipt.payload_hash = payload_hash THEN RETURN existing_receipt.result; END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;
  -- A user-level lock, together with the partial unique index above, prevents
  -- two distinct invite operations from creating memberships in two schools.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pilot.join:' || actor::text, 0));
  SELECT * INTO invite_row FROM public.group_invites WHERE token_hash = payload_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  SELECT school_row.status, group_row.status INTO school_status, group_status
  FROM public.school_groups AS group_row
  JOIN public.schools AS school_row ON school_row.id = group_row.school_id
  WHERE group_row.id = invite_row.group_id AND school_row.id = invite_row.school_id
  FOR UPDATE OF group_row, school_row;
  IF NOT FOUND OR school_status <> 'active' OR group_status <> 'active'
    OR invite_row.revoked_at IS NOT NULL OR invite_row.expires_at <= clock_timestamp() OR invite_row.uses >= invite_row.max_uses THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;
  -- Revoking the inviter's group assignment also retires their outstanding
  -- links. A coordinator remains school-wide while their membership is active.
  IF NOT EXISTS (
    SELECT 1 FROM public.school_memberships AS inviter_membership
    WHERE inviter_membership.id = invite_row.created_by_membership_id
      AND inviter_membership.school_id = invite_row.school_id
      AND inviter_membership.ended_at IS NULL
      AND (
        inviter_membership.role = 'coordinator'
        OR (
          inviter_membership.role = 'teacher' AND EXISTS (
            SELECT 1 FROM public.group_teachers AS inviter_group
            WHERE inviter_group.group_id = invite_row.group_id
              AND inviter_group.school_id = invite_row.school_id
              AND inviter_group.school_membership_id = inviter_membership.id
              AND inviter_group.ended_at IS NULL
          )
        )
      )
  ) THEN RETURN jsonb_build_object('error', 'expired'); END IF;
  IF EXISTS (
    SELECT 1 FROM public.school_memberships AS other_membership
    WHERE other_membership.user_id = actor AND other_membership.ended_at IS NULL AND other_membership.school_id <> invite_row.school_id
  ) THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;
  SELECT * INTO membership_row FROM public.school_memberships
    WHERE school_id = invite_row.school_id AND user_id = actor AND ended_at IS NULL FOR UPDATE;
  IF FOUND AND membership_row.role <> 'student' THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;
  IF NOT FOUND THEN
    INSERT INTO public.school_memberships (school_id, user_id, role) VALUES (invite_row.school_id, actor, 'student')
    RETURNING * INTO membership_row;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.group_memberships WHERE group_id = invite_row.group_id AND school_membership_id = membership_row.id AND ended_at IS NULL
  ) THEN
    INSERT INTO public.group_memberships (school_id, group_id, school_membership_id)
    VALUES (invite_row.school_id, invite_row.group_id, membership_row.id);
    UPDATE public.group_invites SET uses = uses + 1 WHERE id = invite_row.id;
  END IF;
  safe_result := jsonb_build_object('groupId', invite_row.group_id);
  INSERT INTO public.pilot_operation_receipts (actor_id, operation_id, kind, payload_hash, result)
  VALUES (actor, operation_id, 'pilot.join', payload_hash, safe_result);
  INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, school_id, operation_id, metadata)
  VALUES (actor, 'user', 'pilot.group_joined', 'school_group', invite_row.group_id, invite_row.school_id, operation_id,
    jsonb_build_object('result', 'accepted', 'reason_code', 'normal', 'count', 1, 'schema_version', 'v1'));
  RETURN safe_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_approved_program_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  old_status TEXT;
  new_status TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO old_status FROM public.pilot_programs WHERE id = OLD.program_id;
    IF old_status IN ('approved', 'retired') THEN
      RAISE EXCEPTION 'approved pilot programme items are immutable';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO new_status FROM public.pilot_programs WHERE id = NEW.program_id;
    IF new_status IN ('approved', 'retired') THEN
      RAISE EXCEPTION 'approved pilot programme items are immutable';
    END IF;
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
CREATE TRIGGER pilot_programs_approved_immutable
  BEFORE UPDATE ON public.pilot_programs
  FOR EACH ROW EXECUTE FUNCTION public.reject_approved_program_mutation();

CREATE OR REPLACE FUNCTION public.reject_published_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('published', 'cancelled') THEN
    RAISE EXCEPTION 'published pilot assignments are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'published pilot assignments are immutable';
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
  -- Lock the current roster before its count is checked and before the
  -- immutable assignment snapshot is made.
  PERFORM 1 FROM public.group_memberships AS group_membership
  WHERE group_membership.group_id = group_row.id AND group_membership.school_id = group_row.school_id
    AND group_membership.ended_at IS NULL FOR UPDATE;
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
  safe_result := jsonb_build_object('assignmentId', assignment_id_value, 'participants', participant_count);
  INSERT INTO public.pilot_assignment_receipts (actor_id, operation_id, payload_hash, result) VALUES (actor, operation_id, payload_hash, safe_result);
  INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, school_id, operation_id, metadata)
  VALUES (actor, 'user', 'assignment.published', 'assignment', assignment_id_value, group_row.school_id, operation_id,
    jsonb_build_object('result', 'accepted', 'reason_code', 'normal', 'count', participant_count, 'schema_version', 'v1'));
  RETURN safe_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_cancel_assignment_v1(operation_id UUID, assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  actor UUID := auth.uid();
  assignment_row public.assignments%ROWTYPE;
  actor_membership public.school_memberships%ROWTYPE;
  existing_receipt public.pilot_assignment_receipts%ROWTYPE;
  payload_hash TEXT;
  safe_result JSONB;
BEGIN
  IF actor IS NULL THEN RETURN jsonb_build_object('error', 'unauthenticated'); END IF;
  IF operation_id IS NULL OR assignment_id IS NULL THEN RETURN jsonb_build_object('error', 'invalid-input'); END IF;
  payload_hash := public.pilot_hash_v1('cancel:' || assignment_id::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':' || operation_id::text, 0));
  SELECT * INTO existing_receipt FROM public.pilot_assignment_receipts AS receipt_row
    WHERE receipt_row.actor_id = actor AND receipt_row.operation_id = pilot_cancel_assignment_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.payload_hash = payload_hash THEN RETURN existing_receipt.result; END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;
  SELECT * INTO assignment_row FROM public.assignments WHERE id = pilot_cancel_assignment_v1.assignment_id FOR UPDATE;
  IF NOT FOUND OR assignment_row.status <> 'published' THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  SELECT * INTO actor_membership FROM public.school_memberships AS membership
  WHERE membership.school_id = assignment_row.school_id AND membership.user_id = actor
    AND membership.ended_at IS NULL AND membership.role IN ('teacher', 'coordinator') FOR UPDATE;
  IF NOT FOUND OR (
    actor_membership.role = 'teacher' AND NOT EXISTS (
      SELECT 1 FROM public.group_teachers AS teacher_group
      WHERE teacher_group.group_id = assignment_row.group_id AND teacher_group.school_id = assignment_row.school_id
        AND teacher_group.school_membership_id = actor_membership.id AND teacher_group.ended_at IS NULL
    )
  ) THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  UPDATE public.assignments SET status = 'cancelled' WHERE id = assignment_row.id;
  safe_result := jsonb_build_object('assignmentId', assignment_row.id, 'status', 'cancelled');
  INSERT INTO public.pilot_assignment_receipts (actor_id, operation_id, payload_hash, result) VALUES (actor, operation_id, payload_hash, safe_result);
  INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, school_id, operation_id, metadata)
  VALUES (actor, 'user', 'assignment.cancelled', 'assignment', assignment_row.id, assignment_row.school_id, operation_id,
    jsonb_build_object('result', 'cancelled', 'reason_code', 'normal', 'count', 1, 'schema_version', 'v1'));
  RETURN safe_result;
END;
$$;

CREATE TABLE public.pilot_provision_receipts (
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, operation_id)
);

CREATE OR REPLACE FUNCTION public.pilot_provision_school_v1(
  operation_id UUID,
  requested_school_id UUID,
  school_name TEXT,
  coordinator_id UUID,
  operator_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  existing_receipt public.pilot_provision_receipts%ROWTYPE;
  payload_hash TEXT;
  coordinator_membership_id UUID;
  safe_result JSONB;
BEGIN
  IF auth.role() <> 'service_role' THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;
  IF operation_id IS NULL OR requested_school_id IS NULL OR coordinator_id IS NULL OR operator_id IS NULL
    OR school_name IS NULL OR char_length(btrim(school_name)) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('error', 'invalid-input');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = coordinator_id)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = operator_id) THEN
    RETURN jsonb_build_object('error', 'not-found');
  END IF;
  payload_hash := public.pilot_hash_v1(requested_school_id::text || ':' || btrim(school_name) || ':' || coordinator_id::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operator_id::text || ':' || operation_id::text, 0));
  SELECT * INTO existing_receipt FROM public.pilot_provision_receipts AS receipt_row
    WHERE receipt_row.operator_id = operator_id AND receipt_row.operation_id = pilot_provision_school_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.payload_hash = payload_hash THEN RETURN existing_receipt.result; END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;
  IF EXISTS (SELECT 1 FROM public.schools WHERE id = requested_school_id) THEN RETURN jsonb_build_object('error', 'operation-conflict'); END IF;
  INSERT INTO public.schools (id, name, status, timezone) VALUES (requested_school_id, btrim(school_name), 'active', 'Asia/Almaty');
  INSERT INTO public.school_memberships (school_id, user_id, role)
  VALUES (requested_school_id, coordinator_id, 'coordinator') RETURNING id INTO coordinator_membership_id;
  safe_result := jsonb_build_object('schoolId', requested_school_id, 'coordinatorMembershipId', coordinator_membership_id, 'created', true);
  INSERT INTO public.pilot_provision_receipts (operator_id, operation_id, payload_hash, result)
  VALUES (operator_id, operation_id, payload_hash, safe_result);
  INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, school_id, operation_id, metadata)
  VALUES (operator_id, 'operator', 'pilot.school_provisioned', 'school', requested_school_id, requested_school_id, operation_id,
    jsonb_build_object('result', 'accepted', 'reason_code', 'normal', 'count', 1, 'schema_version', 'v1'));
  RETURN safe_result;
END;
$$;

ALTER TABLE public.pilot_provision_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pilot_provision_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_has_active_school_role_v1(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_create_group_invite_v1(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pilot_join_group_v1(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pilot_publish_assignment_v1(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pilot_cancel_assignment_v1(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pilot_provision_school_v1(UUID, UUID, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_create_group_invite_v1(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_join_group_v1(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_publish_assignment_v1(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_cancel_assignment_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_provision_school_v1(UUID, UUID, TEXT, UUID, UUID) TO service_role;
