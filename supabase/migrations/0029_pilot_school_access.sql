-- A3/S01: a narrow school and group boundary for the supervised pilot.
-- Browser roles receive no table CRUD. They can call only the two constrained
-- RPCs below; all later learning writes remain service-role-only.

CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Almaty' CHECK (timezone = 'Asia/Almaty'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.school_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'coordinator')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CHECK (ended_at IS NULL OR ended_at >= joined_at),
  UNIQUE (id, school_id)
);
CREATE UNIQUE INDEX school_memberships_one_active_school_user
  ON public.school_memberships (school_id, user_id) WHERE ended_at IS NULL;
CREATE INDEX school_memberships_active_user_idx
  ON public.school_memberships (user_id, school_id) WHERE ended_at IS NULL;

CREATE TABLE public.school_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  locale TEXT NOT NULL CHECK (locale IN ('ru', 'kk')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, school_id)
);
CREATE INDEX school_groups_school_active_idx ON public.school_groups (school_id, status, created_at DESC);

CREATE TABLE public.group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  group_id UUID NOT NULL,
  school_membership_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CHECK (ended_at IS NULL OR ended_at >= joined_at),
  FOREIGN KEY (group_id, school_id) REFERENCES public.school_groups (id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (school_membership_id, school_id) REFERENCES public.school_memberships (id, school_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX group_memberships_one_active_group_member
  ON public.group_memberships (group_id, school_membership_id) WHERE ended_at IS NULL;
CREATE INDEX group_memberships_active_group_idx ON public.group_memberships (group_id, school_membership_id) WHERE ended_at IS NULL;

CREATE TABLE public.group_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  group_id UUID NOT NULL,
  school_membership_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CHECK (ended_at IS NULL OR ended_at >= assigned_at),
  FOREIGN KEY (group_id, school_id) REFERENCES public.school_groups (id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (school_membership_id, school_id) REFERENCES public.school_memberships (id, school_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX group_teachers_one_active_group_teacher
  ON public.group_teachers (group_id, school_membership_id) WHERE ended_at IS NULL;

CREATE TABLE public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  group_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER NOT NULL CHECK (max_uses BETWEEN 1 AND 100),
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses BETWEEN 0 AND max_uses),
  revoked_at TIMESTAMPTZ,
  created_by_membership_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, school_id) REFERENCES public.school_groups (id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_membership_id, school_id) REFERENCES public.school_memberships (id, school_id) ON DELETE CASCADE,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '72 hours')
);
CREATE INDEX group_invites_active_group_idx ON public.group_invites (group_id, expires_at) WHERE revoked_at IS NULL;

-- Invite and join idempotency never reuses the learning receipt table, whose
-- kind allowlist is intentionally limited to learning operations. Invite
-- results exclude the one-time plaintext secret.
CREATE TABLE public.pilot_operation_receipts (
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pilot.invite', 'pilot.join')),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation_id)
);
CREATE INDEX pilot_operation_receipts_created_idx ON public.pilot_operation_receipts (created_at);

CREATE OR REPLACE FUNCTION public.pilot_hash_v1(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(value, 'UTF8'), 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.pilot_has_active_school_role_v1(target_school_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships AS membership_row
    JOIN public.schools AS school_row ON school_row.id = membership_row.school_id
    WHERE membership_row.school_id = target_school_id
      AND membership_row.user_id = auth.uid()
      AND membership_row.ended_at IS NULL
      AND membership_row.role = ANY (allowed_roles)
      AND school_row.status = 'active'
  )
$$;

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
  existing_receipt public.pilot_operation_receipts%ROWTYPE;
  payload_hash TEXT;
  raw_token TEXT;
  invite_id UUID;
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
  SELECT * INTO group_row FROM public.school_groups AS target_group
    WHERE target_group.id = pilot_create_group_invite_v1.group_id AND target_group.status = 'active' FOR UPDATE;
  IF NOT FOUND OR NOT public.pilot_has_active_school_role_v1(group_row.school_id, ARRAY['teacher', 'coordinator']) THEN
    RETURN jsonb_build_object('error', 'not-found');
  END IF;
  raw_token := replace(translate(pg_catalog.encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=', '');
  expires_at_value := clock_timestamp() + make_interval(hours => expires_in_hours);
  INSERT INTO public.group_invites (school_id, group_id, token_hash, expires_at, max_uses, created_by_membership_id)
  SELECT group_row.school_id, group_row.id, public.pilot_hash_v1(raw_token), expires_at_value, max_uses, membership_row.id
  FROM public.school_memberships AS membership_row
  WHERE membership_row.school_id = group_row.school_id AND membership_row.user_id = actor
    AND membership_row.ended_at IS NULL AND membership_row.role IN ('teacher', 'coordinator')
  RETURNING id INTO invite_id;
  IF invite_id IS NULL THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
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
  SELECT * INTO invite_row FROM public.group_invites
    WHERE token_hash = payload_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not-found'); END IF;
  IF invite_row.revoked_at IS NOT NULL OR invite_row.expires_at <= clock_timestamp() OR invite_row.uses >= invite_row.max_uses THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;
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

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_operation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schools, public.school_memberships, public.school_groups, public.group_memberships,
  public.group_teachers, public.group_invites, public.pilot_operation_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_hash_v1(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_has_active_school_role_v1(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_create_group_invite_v1(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pilot_join_group_v1(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_create_group_invite_v1(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_join_group_v1(UUID, TEXT) TO authenticated;
