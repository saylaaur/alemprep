-- Self-study pilot: read-only, Auth-scoped teacher overview. No new table grants.
CREATE OR REPLACE FUNCTION public.pilot_teacher_dashboard_v1(target_group_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor UUID := auth.uid();
  cutoff TIMESTAMPTZ := statement_timestamp();
  group_info JSONB;
  roster JSONB;
BEGIN
  IF actor IS NULL THEN RETURN jsonb_build_object('error', 'unauthenticated'); END IF;
  IF target_group_id IS NULL THEN
    RETURN jsonb_build_object('groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name,
        'schoolName', school.name, 'locale', g.locale) ORDER BY school.name, g.name, g.id)
      FROM public.school_groups g JOIN public.schools school ON school.id = g.school_id
      WHERE g.status = 'active' AND school.status = 'active' AND EXISTS (
        SELECT 1 FROM public.school_memberships m WHERE m.school_id = g.school_id
          AND m.user_id = actor AND m.ended_at IS NULL AND (
            m.role = 'coordinator' OR (m.role = 'teacher' AND EXISTS (
              SELECT 1 FROM public.group_teachers gt WHERE gt.group_id = g.id
                AND gt.school_membership_id = m.id AND gt.ended_at IS NULL
            ))
          )
      )
    ), '[]'::jsonb));
  END IF;
  SELECT jsonb_build_object('id', g.id, 'name', g.name, 'schoolName', school.name, 'locale', g.locale)
    INTO group_info
    FROM public.school_groups g JOIN public.schools school ON school.id = g.school_id
    WHERE g.id = target_group_id AND g.status = 'active' AND school.status = 'active' AND EXISTS (
      SELECT 1 FROM public.school_memberships m WHERE m.school_id = g.school_id
        AND m.user_id = actor AND m.ended_at IS NULL AND (
          m.role = 'coordinator' OR (m.role = 'teacher' AND EXISTS (
            SELECT 1 FROM public.group_teachers gt WHERE gt.group_id = g.id
              AND gt.school_membership_id = m.id AND gt.ended_at IS NULL
          ))
        )
    );
  IF group_info IS NULL THEN RETURN jsonb_build_object('error', 'not-found'); END IF;

  WITH members AS (
    SELECT m.user_id, p.full_name,
      greatest(m.joined_at, gm.joined_at) AS since
    FROM public.group_memberships gm
    JOIN public.school_memberships m ON m.id = gm.school_membership_id AND m.school_id = gm.school_id
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE gm.group_id = target_group_id AND gm.ended_at IS NULL
      AND m.ended_at IS NULL AND m.role = 'student'
  ), facts AS (
    SELECT a.user_id, v.family_id, a.points, a.max_points, a.attempted_at,
      row_number() OVER (PARTITION BY a.user_id, v.family_id ORDER BY a.attempted_at, a.id) AS family_attempt
    FROM members m JOIN public.attempts a ON a.user_id = m.user_id
    JOIN public.sessions s ON s.id = a.session_id AND s.user_id = a.user_id
    JOIN public.session_items item ON item.id = a.session_item_id AND item.session_id = s.id
    JOIN public.question_versions v ON v.id = item.question_version_id AND v.question_id = a.question_id
    WHERE a.integrity_version = 1 AND s.integrity_version = 1 AND s.mode = 'practice'
      AND s.status = 'submitted' AND s.receipt IS NOT NULL
      AND s.started_at >= m.since AND a.attempted_at >= m.since AND a.attempted_at <= cutoff
      AND a.points IS NOT NULL AND a.max_points > 0
      -- A status label alone is not an accepted answer. Require its commit receipt.
      AND EXISTS (SELECT 1 FROM public.operation_receipts r WHERE r.actor_id = a.user_id
        AND r.kind = 'learning.submit' AND r.result = s.receipt)
  ), per_student AS (
    SELECT m.user_id, m.full_name, count(f.user_id)::int AS attempts,
      count(f.user_id) FILTER (WHERE f.family_attempt = 1)::int AS unique_questions,
      coalesce(sum(f.points) FILTER (WHERE f.family_attempt = 1), 0)::int AS first_points,
      coalesce(sum(f.max_points) FILTER (WHERE f.family_attempt = 1), 0)::int AS first_max_points,
      max(f.attempted_at) AS last_active_at
    -- Rank the full membership history first, then select this reporting window.
    -- An old first attempt never turns a recent repeat into a new first attempt.
    FROM members m LEFT JOIN facts f ON f.user_id = m.user_id
      AND f.attempted_at >= cutoff - interval '30 days'
    GROUP BY m.user_id, m.full_name
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', user_id, 'name', coalesce(nullif(btrim(full_name), ''), ''),
    'attempts', attempts, 'uniqueQuestions', unique_questions,
    'firstPoints', first_points, 'firstMaxPoints', first_max_points,
    'lastActiveAt', last_active_at
  ) ORDER BY full_name NULLS LAST, user_id), '[]'::jsonb) INTO roster FROM per_student;
  RETURN jsonb_build_object('group', group_info, 'students', roster, 'asOf', cutoff, 'periodDays', 30);
END;
$$;
REVOKE ALL ON FUNCTION public.pilot_teacher_dashboard_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_teacher_dashboard_v1(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
