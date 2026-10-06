-- A3/S02: immutable Russian pilot programme and participant snapshot.
-- Browser roles can publish only through the constrained RPC below.

CREATE TABLE public.pilot_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  title_ru TEXT NOT NULL CHECK (char_length(btrim(title_ru)) BETWEEN 1 AND 160),
  title_kk TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  review_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR review_ref IS NOT NULL AND char_length(btrim(review_ref)) BETWEEN 1 AND 160),
  UNIQUE (id, version)
);

CREATE TABLE public.pilot_program_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.pilot_programs(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  question_version_id UUID NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  locale TEXT NOT NULL CHECK (locale IN ('ru', 'kk')),
  purpose TEXT NOT NULL CHECK (purpose IN ('practice', 'baseline', 'endline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, locale, purpose, position),
  UNIQUE (program_id, question_version_id)
);
CREATE INDEX pilot_program_items_order_idx ON public.pilot_program_items(program_id, locale, purpose, position);

CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  group_id UUID NOT NULL,
  program_id UUID NOT NULL REFERENCES public.pilot_programs(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL DEFAULT 'practice' CHECK (purpose = 'practice'),
  comparison_baseline_id UUID REFERENCES public.assignments(id) ON DELETE RESTRICT,
  opens_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  created_by_membership_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (opens_at <= due_at AND due_at <= closes_at),
  CHECK (closes_at <= opens_at + interval '90 days'),
  FOREIGN KEY (group_id, school_id) REFERENCES public.school_groups(id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, school_id) REFERENCES public.school_memberships(id, school_id) ON DELETE RESTRICT
);
CREATE INDEX assignments_group_window_idx ON public.assignments(group_id, opens_at, closes_at);

CREATE TABLE public.assignment_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
  school_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  school_membership_id UUID NOT NULL,
  eligible_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  UNIQUE (assignment_id, user_id),
  FOREIGN KEY (school_membership_id, school_id) REFERENCES public.school_memberships(id, school_id) ON DELETE RESTRICT,
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= eligible_from)
);
CREATE INDEX assignment_participants_user_idx ON public.assignment_participants(user_id, assignment_id);

CREATE TABLE public.pilot_assignment_receipts (
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation_id)
);
CREATE INDEX pilot_assignment_receipts_created_idx ON public.pilot_assignment_receipts(created_at);

CREATE OR REPLACE FUNCTION public.reject_approved_program_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_program_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.program_id ELSE NEW.program_id END;
  target_status TEXT;
BEGIN
  SELECT status INTO target_status FROM public.pilot_programs WHERE id = target_program_id;
  IF target_status = 'approved' THEN
    RAISE EXCEPTION 'approved pilot programme items are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER pilot_program_items_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.pilot_program_items
  FOR EACH ROW EXECUTE FUNCTION public.reject_approved_program_item_mutation();

CREATE OR REPLACE FUNCTION public.reject_published_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published pilot assignments are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER assignments_published_immutable
  BEFORE UPDATE OR DELETE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.reject_published_assignment_mutation();

CREATE OR REPLACE FUNCTION public.pilot_publish_assignment_v1(
  operation_id UUID,
  group_id UUID,
  program_id UUID,
  opens_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ
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
  actor_membership_id UUID;
  existing_receipt public.pilot_assignment_receipts%ROWTYPE;
  payload_hash TEXT;
  assignment_id_value UUID;
  participant_count INTEGER;
  item_total INTEGER;
  item_valid INTEGER;
  safe_result JSONB;
BEGIN
  IF actor IS NULL THEN RETURN jsonb_build_object('error', 'unauthenticated'); END IF;
  IF operation_id IS NULL OR group_id IS NULL OR program_id IS NULL
    OR opens_at IS NULL OR due_at IS NULL OR closes_at IS NULL
    OR opens_at > due_at OR due_at > closes_at
    OR closes_at > opens_at + interval '90 days' THEN
    RETURN jsonb_build_object('error', 'invalid-input');
  END IF;

  payload_hash := public.pilot_hash_v1(
    group_id::text || ':' || program_id::text || ':' || opens_at::text || ':' || due_at::text || ':' || closes_at::text
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':' || operation_id::text, 0));
  SELECT * INTO existing_receipt FROM public.pilot_assignment_receipts AS receipt_row
    WHERE receipt_row.actor_id = actor AND receipt_row.operation_id = pilot_publish_assignment_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.payload_hash = payload_hash THEN RETURN existing_receipt.result; END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;

  SELECT * INTO group_row FROM public.school_groups AS target_group
    WHERE target_group.id = pilot_publish_assignment_v1.group_id AND target_group.status = 'active' FOR UPDATE;
  IF NOT FOUND OR NOT public.pilot_has_active_school_role_v1(group_row.school_id, ARRAY['teacher', 'coordinator']) THEN
    RETURN jsonb_build_object('error', 'not-found');
  END IF;
  SELECT membership.id INTO actor_membership_id
  FROM public.school_memberships AS membership
  WHERE membership.school_id = group_row.school_id AND membership.user_id = actor
    AND membership.ended_at IS NULL AND membership.role IN ('teacher', 'coordinator')
  FOR UPDATE;
  IF actor_membership_id IS NULL THEN RETURN jsonb_build_object('error', 'not-found'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pilot_programs AS program
    WHERE program.id = pilot_publish_assignment_v1.program_id AND program.status = 'approved'
  ) THEN RETURN jsonb_build_object('error', 'content-unavailable'); END IF;

  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE item.locale = 'ru' AND item.purpose = 'practice'
             AND version.locale = 'ru' AND publication.status = 'approved'
         )::integer
    INTO item_total, item_valid
  FROM public.pilot_program_items AS item
  JOIN public.question_versions AS version ON version.id = item.question_version_id
  LEFT JOIN public.question_publications AS publication ON publication.question_version_id = version.id
  WHERE item.program_id = pilot_publish_assignment_v1.program_id;
  IF item_total = 0 OR item_total <> item_valid THEN RETURN jsonb_build_object('error', 'content-unavailable'); END IF;

  INSERT INTO public.assignments (
    school_id, group_id, program_id, opens_at, due_at, closes_at, created_by_membership_id
  ) VALUES (
    group_row.school_id, group_row.id, program_id, opens_at, due_at, closes_at, actor_membership_id
  ) RETURNING id INTO assignment_id_value;

  INSERT INTO public.assignment_participants (assignment_id, school_id, user_id, school_membership_id)
  SELECT assignment_id_value, group_row.school_id, membership.user_id, membership.id
  FROM public.group_memberships AS group_membership
  JOIN public.school_memberships AS membership ON membership.id = group_membership.school_membership_id
    AND membership.school_id = group_membership.school_id
  WHERE group_membership.group_id = group_row.id AND group_membership.school_id = group_row.school_id
    AND group_membership.ended_at IS NULL AND membership.ended_at IS NULL AND membership.role = 'student';
  GET DIAGNOSTICS participant_count = ROW_COUNT;
  IF participant_count = 0 THEN
    DELETE FROM public.assignments WHERE id = assignment_id_value;
    RETURN jsonb_build_object('error', 'not-found');
  END IF;

  safe_result := jsonb_build_object('assignmentId', assignment_id_value, 'participants', participant_count);
  INSERT INTO public.pilot_assignment_receipts (actor_id, operation_id, payload_hash, result)
  VALUES (actor, operation_id, payload_hash, safe_result);
  INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, school_id, operation_id, metadata)
  VALUES (actor, 'user', 'assignment.published', 'assignment', assignment_id_value, group_row.school_id, operation_id,
    jsonb_build_object('result', 'accepted', 'reason_code', 'normal', 'count', participant_count, 'schema_version', 'v1'));
  RETURN safe_result;
END;
$$;

ALTER TABLE public.pilot_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_program_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_assignment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pilot_programs, public.pilot_program_items, public.assignments,
  public.assignment_participants, public.pilot_assignment_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_publish_assignment_v1(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_publish_assignment_v1(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
