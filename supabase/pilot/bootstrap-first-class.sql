-- Operator data bootstrap, NOT a schema migration. Run only in the project's SQL Editor as postgres.
-- Copy privately; replace SET markers with v_name := 'escaped value'; assignments.
-- Generate school_id/group_id once and reuse them on retry. Do not expose SQL access to teachers.
DO $bootstrap$
DECLARE
  v_school_id UUID; v_group_id UUID;
  v_operator_email TEXT := ''; v_teacher_email TEXT := '';
  v_school_name TEXT := ''; v_group_name TEXT := ''; v_locale TEXT := 'ru';
  v_operator_id UUID; v_teacher_id UUID; v_membership_id UUID;
  v_school public.schools%ROWTYPE;
  v_group public.school_groups%ROWTYPE;
  v_membership public.school_memberships%ROWTYPE;
  v_binding public.group_teachers%ROWTYPE;
  v_changed BOOLEAN := false;
BEGIN
  -- SET school_id
  -- SET group_id
  -- SET operator_email
  -- SET teacher_email
  -- SET school_name
  -- SET group_name
  IF current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'operator-only' USING ERRCODE='42501';
  END IF;
  IF v_school_id IS NULL OR v_group_id IS NULL OR v_locale NOT IN ('ru','kk')
    OR length(btrim(v_school_name)) NOT BETWEEN 1 AND 160 OR length(btrim(v_group_name)) NOT BETWEEN 1 AND 120
    OR btrim(v_operator_email)='' OR btrim(v_teacher_email)='' THEN
    RAISE EXCEPTION 'configure-bootstrap' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout','2s',true);
  SELECT id INTO v_operator_id FROM auth.users WHERE lower(email)=lower(btrim(v_operator_email));
  SELECT id INTO v_teacher_id FROM auth.users WHERE lower(email)=lower(btrim(v_teacher_email));
  IF v_operator_id IS NULL OR v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'account-must-sign-in' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('first-class:'||v_school_id::text,0));
  -- This is an initial bootstrap/retry helper, never a role-restoration operation.
  IF EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=v_school_id
    AND user_id IN (v_operator_id,v_teacher_id) AND ended_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.group_teachers gt JOIN public.school_memberships m ON m.id=gt.school_membership_id
      WHERE gt.group_id=v_group_id AND m.user_id=v_teacher_id AND gt.ended_at IS NOT NULL) THEN
    RAISE EXCEPTION 'binding-withdrawn' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_school FROM public.schools WHERE id=v_school_id FOR UPDATE;
  IF FOUND THEN
    IF v_school.name IS DISTINCT FROM btrim(v_school_name) OR v_school.status<>'active' THEN
      RAISE EXCEPTION 'school-conflict' USING ERRCODE='22023';
    END IF;
  ELSE
    INSERT INTO public.schools(id,name,status,timezone) VALUES(v_school_id,btrim(v_school_name),'active','Asia/Almaty');
    v_changed:=true;
  END IF;
  SELECT * INTO v_group FROM public.school_groups WHERE id=v_group_id FOR UPDATE;
  IF FOUND THEN
    IF v_group.school_id IS DISTINCT FROM v_school_id OR v_group.name IS DISTINCT FROM btrim(v_group_name)
      OR v_group.locale IS DISTINCT FROM v_locale OR v_group.status<>'active' THEN
      RAISE EXCEPTION 'group-conflict' USING ERRCODE='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM public.group_teachers gt JOIN public.school_memberships m ON m.id=gt.school_membership_id
      WHERE gt.group_id=v_group_id AND gt.ended_at IS NULL AND m.user_id<>v_teacher_id) THEN
      RAISE EXCEPTION 'teacher-conflict' USING ERRCODE='22023';
    END IF;
  ELSE
    INSERT INTO public.school_groups(id,school_id,name,locale,status) VALUES(v_group_id,v_school_id,btrim(v_group_name),v_locale,'active');
    v_changed:=true;
  END IF;
  SELECT * INTO v_membership FROM public.school_memberships
    WHERE school_id=v_school_id AND user_id=v_operator_id AND ended_at IS NULL FOR UPDATE;
  IF FOUND THEN
    IF v_membership.role<>'coordinator' THEN RAISE EXCEPTION 'coordinator-role-conflict' USING ERRCODE='22023'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=v_school_id AND user_id=v_operator_id AND ended_at IS NOT NULL) THEN
      RAISE EXCEPTION 'binding-withdrawn' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.school_memberships(school_id,user_id,role) VALUES(v_school_id,v_operator_id,'coordinator');
    v_changed:=true;
  END IF;
  SELECT * INTO v_membership FROM public.school_memberships
    WHERE school_id=v_school_id AND user_id=v_teacher_id AND ended_at IS NULL FOR UPDATE;
  IF FOUND THEN
    IF v_membership.role NOT IN ('teacher','coordinator') THEN RAISE EXCEPTION 'teacher-role-conflict' USING ERRCODE='22023'; END IF;
    v_membership_id:=v_membership.id;
  ELSE
    IF EXISTS(SELECT 1 FROM public.school_memberships WHERE school_id=v_school_id AND user_id=v_teacher_id AND ended_at IS NOT NULL) THEN
      RAISE EXCEPTION 'binding-withdrawn' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.school_memberships(school_id,user_id,role) VALUES(v_school_id,v_teacher_id,'teacher') RETURNING id INTO v_membership_id;
    v_changed:=true;
  END IF;
  SELECT * INTO v_binding FROM public.group_teachers
    WHERE group_id=v_group_id AND school_membership_id=v_membership_id AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM public.group_teachers WHERE group_id=v_group_id AND school_membership_id=v_membership_id AND ended_at IS NOT NULL) THEN
      RAISE EXCEPTION 'binding-withdrawn' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.group_teachers(school_id,group_id,school_membership_id) VALUES(v_school_id,v_group_id,v_membership_id);
    v_changed:=true;
  END IF;
  IF v_changed THEN
    INSERT INTO public.audit_events(actor_id,actor_kind,event_type,entity_type,entity_id,school_id,operation_id,metadata)
      VALUES(v_operator_id,'operator','pilot.class_bootstrapped','school_group',v_group_id,v_school_id,v_group_id,
        jsonb_build_object('result','accepted','count',1,'schema_version','v1'));
  END IF;
END;
$bootstrap$;
