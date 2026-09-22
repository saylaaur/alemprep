-- L02b: keep L02a-R validation intact and add trusted rewards in the same
-- transaction as an accepted submission. Browser roles still cannot EXECUTE
-- either function; only the server's service_role reaches this boundary.

ALTER FUNCTION public.commit_learning_v1(UUID, UUID, TEXT, UUID, JSONB, TEXT)
  RENAME TO commit_learning_v1_l02a;

-- PostgreSQL preserves a PL/pgSQL function body verbatim on rename. The L02a
-- body qualifies its parameters with the function name, so update that name
-- once, from the definition just renamed above, before calling it internally.
DO $$
DECLARE
  l02a_definition TEXT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.commit_learning_v1_l02a(uuid, uuid, text, uuid, jsonb, text)'::pg_catalog.regprocedure
  ) INTO l02a_definition;
  EXECUTE replace(l02a_definition, 'commit_learning_v1.', 'commit_learning_v1_l02a.');
END;
$$;

-- `reward_ledger` already makes a family reward unique for a local day. A
-- weekly key includes the ISO week, so it needs an additional cross-day guard.
CREATE UNIQUE INDEX reward_ledger_weekly_reward_unique
  ON public.reward_ledger (user_id, reward_key)
  WHERE reward_key ~ '^weekly-bonus:[0-9]{4}-W[0-9]{2}$';

CREATE OR REPLACE FUNCTION public.commit_learning_v1(
  actor_id UUID,
  operation_id UUID,
  payload_hash TEXT,
  session_id UUID,
  graded_items JSONB,
  scoring_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_variable
DECLARE
  existing_receipt public.operation_receipts%ROWTYPE;
  learning_session public.sessions%ROWTYPE;
  profile_row public.profiles%ROWTYPE;
  commit_result JSONB;
  accepted_at_value TIMESTAMPTZ;
  almaty_day DATE;
  session_mode TEXT;
  old_xp_awarded INTEGER;
  xp_delta INTEGER := 0;
  xp_awarded INTEGER;
  weekly_bonus INTEGER;
  weekly_reward_key TEXT;
  next_streak INTEGER;
  next_freezes INTEGER;
  freeze_used BOOLEAN := false;
  trusted_attempt_count INTEGER;
  trusted_streak_days INTEGER;
  topic_mastery BOOLEAN;
  exam_ninety BOOLEAN := false;
BEGIN
  -- The wrapper owns the same idempotency boundary as L02a. Lock before the
  -- receipt lookup so concurrent retries cannot enter reward processing.
  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  PERFORM pg_catalog.set_config('statement_timeout', '5s', true);
  IF actor_id IS NULL OR operation_id IS NULL OR session_id IS NULL
    OR payload_hash IS NULL OR char_length(payload_hash) = 0
    OR scoring_version IS NULL THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || operation_id::text, 0)
  );

  -- Preserve an already accepted receipt exactly, including receipts created
  -- before this migration. A changed payload retains the existing contract.
  SELECT * INTO existing_receipt
  FROM public.operation_receipts AS receipt_row
  WHERE receipt_row.actor_id = commit_learning_v1.actor_id
    AND receipt_row.operation_id = commit_learning_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.kind = 'learning.submit' AND existing_receipt.payload_hash = commit_learning_v1.payload_hash THEN
      RETURN existing_receipt.result;
    END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;

  commit_result := public.commit_learning_v1_l02a(
    actor_id, operation_id, payload_hash, session_id, graded_items, scoring_version
  );
  IF commit_result ? 'error' THEN
    RETURN commit_result;
  END IF;

  SELECT * INTO learning_session
  FROM public.sessions
  WHERE id = commit_learning_v1.session_id
  FOR UPDATE;
  IF NOT FOUND OR learning_session.user_id <> actor_id OR learning_session.status <> 'submitted' THEN
    RAISE EXCEPTION 'temporarily-unavailable' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id = actor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  accepted_at_value := learning_session.finished_at;
  almaty_day := timezone('Asia/Almaty', accepted_at_value)::date;
  session_mode := learning_session.mode::text;
  old_xp_awarded := coalesce((commit_result->>'xpAwarded')::integer, 0);
  xp_awarded := old_xp_awarded;

  IF session_mode = 'diagnostic' THEN
    -- L02a-R deliberately awards correct-family rows for every valid mode;
    -- diagnostic is a measurement and must leave no reward side effects.
    DELETE FROM public.reward_ledger AS reward_row
    WHERE reward_row.user_id = actor_id AND reward_row.session_id = learning_session.id;
    xp_delta := -old_xp_awarded;
    xp_awarded := 0;
    UPDATE public.profiles SET xp = profile_row.xp + xp_delta WHERE id = actor_id;
  ELSE
    IF session_mode = 'weekly' THEN
      weekly_reward_key := to_char(almaty_day, 'IYYY') || '-W' || to_char(almaty_day, 'IW');
      INSERT INTO public.reward_ledger (user_id, session_id, reward_key, amount, day)
      VALUES (actor_id, learning_session.id, 'weekly-bonus:' || weekly_reward_key, 30, almaty_day)
      ON CONFLICT DO NOTHING
      RETURNING amount INTO weekly_bonus;
      IF weekly_bonus IS NOT NULL THEN
        xp_delta := xp_delta + weekly_bonus;
        xp_awarded := xp_awarded + weekly_bonus;
      END IF;
    END IF;

    next_streak := profile_row.current_streak;
    next_freezes := profile_row.streak_freezes;
    IF profile_row.last_active_date IS DISTINCT FROM almaty_day THEN
      IF profile_row.last_active_date = almaty_day - 1 THEN
        next_streak := profile_row.current_streak + 1;
      ELSIF profile_row.last_active_date = almaty_day - 2 AND profile_row.streak_freezes > 0 THEN
        next_streak := profile_row.current_streak + 1;
        next_freezes := profile_row.streak_freezes - 1;
        freeze_used := true;
      ELSE
        next_streak := 1;
      END IF;
      next_freezes := least(
        3,
        next_freezes + greatest(0, floor(next_streak::numeric / 7) - floor(profile_row.current_streak::numeric / 7))::integer
      );
    END IF;

    UPDATE public.profiles
    SET xp = profile_row.xp + xp_delta,
      current_streak = next_streak,
      longest_streak = greatest(profile_row.longest_streak, next_streak),
      last_active_date = CASE WHEN profile_row.last_active_date IS DISTINCT FROM almaty_day THEN almaty_day ELSE profile_row.last_active_date END,
      streak_freezes = next_freezes,
      last_freeze_used_date = CASE WHEN freeze_used THEN almaty_day ELSE profile_row.last_freeze_used_date END
    WHERE id = actor_id;

    -- Only immutable facts written by the service-only RPC count here. Legacy
    -- rows and diagnostics remain visible history, but cannot unlock rewards.
    SELECT count(*)::integer INTO trusted_attempt_count
    FROM public.attempts AS trusted_attempt
    JOIN public.sessions AS trusted_session ON trusted_session.id = trusted_attempt.session_id
    WHERE trusted_attempt.user_id = actor_id
      AND trusted_attempt.integrity_version = 1
      AND trusted_session.integrity_version = 1
      AND trusted_session.status = 'submitted'
      AND trusted_session.receipt IS NOT NULL
      AND trusted_session.mode::text <> 'diagnostic';
    WITH RECURSIVE trusted_days AS (
      SELECT DISTINCT timezone('Asia/Almaty', trusted_attempt.attempted_at)::date AS active_day
      FROM public.attempts AS trusted_attempt
      JOIN public.sessions AS trusted_session ON trusted_session.id = trusted_attempt.session_id
      WHERE trusted_attempt.user_id = actor_id
        AND trusted_attempt.integrity_version = 1
        AND trusted_session.integrity_version = 1
        AND trusted_session.status = 'submitted'
        AND trusted_session.receipt IS NOT NULL
        AND trusted_session.mode::text <> 'diagnostic'
    ), trusted_streak AS (
      SELECT almaty_day AS active_day
      UNION ALL
      SELECT trusted_streak.active_day - 1
      FROM trusted_streak
      WHERE trusted_streak.active_day > almaty_day - 29
        AND EXISTS (
        SELECT 1 FROM trusted_days WHERE trusted_days.active_day = trusted_streak.active_day - 1
      )
    )
    SELECT count(*)::integer INTO trusted_streak_days FROM trusted_streak;
    SELECT EXISTS (
      SELECT 1
      FROM public.attempts AS trusted_attempt
      JOIN public.sessions AS trusted_session ON trusted_session.id = trusted_attempt.session_id
      JOIN public.questions AS question_row ON question_row.id = trusted_attempt.question_id
      WHERE trusted_attempt.user_id = actor_id
        AND trusted_attempt.integrity_version = 1
        AND trusted_session.integrity_version = 1
        AND trusted_session.status = 'submitted'
        AND trusted_session.receipt IS NOT NULL
        AND trusted_session.mode::text <> 'diagnostic'
      GROUP BY question_row.topic_id
      HAVING count(*) >= 10
        AND count(*) FILTER (WHERE trusted_attempt.is_correct)::numeric / count(*) > 0.9
    ) INTO topic_mastery;
    IF session_mode = 'mock_exam' AND (commit_result->>'maxScore')::integer > 0 THEN
      exam_ninety := (commit_result->>'score')::numeric / (commit_result->>'maxScore')::numeric >= 0.9;
    END IF;

    INSERT INTO public.user_achievements (user_id, achievement_key)
    SELECT actor_id, candidate.achievement_key
    FROM (VALUES
      ('first-question', trusted_attempt_count >= 1),
      ('solved-100', trusted_attempt_count >= 100),
      ('solved-500', trusted_attempt_count >= 500),
      -- Display streak preserves legacy history; badges require an actual
      -- consecutive trusted run that ends on this Almaty day.
      ('streak-7', trusted_streak_days >= 7),
      ('streak-30', trusted_streak_days >= 30),
      ('topic-mastery', topic_mastery),
      ('exam-complete', session_mode = 'mock_exam'),
      ('exam-90', exam_ninety)
    ) AS candidate(achievement_key, earned)
    WHERE candidate.earned
    ON CONFLICT (user_id, achievement_key) DO NOTHING;
  END IF;

  commit_result := commit_result || jsonb_build_object('xpAwarded', xp_awarded);
  UPDATE public.sessions SET receipt = commit_result WHERE id = learning_session.id;
  UPDATE public.operation_receipts AS receipt_row
  SET result = commit_result
  WHERE receipt_row.actor_id = commit_learning_v1.actor_id
    AND receipt_row.operation_id = commit_learning_v1.operation_id
    AND receipt_row.kind = 'learning.submit';
  RETURN commit_result;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_learning_v1_l02a(UUID, UUID, TEXT, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commit_learning_v1(UUID, UUID, TEXT, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_learning_v1(UUID, UUID, TEXT, UUID, JSONB, TEXT) TO service_role;
-- The wrapper is SECURITY INVOKER, so its server-only caller needs this
-- internal dependency too. It remains unavailable to browser roles.
GRANT EXECUTE ON FUNCTION public.commit_learning_v1_l02a(UUID, UUID, TEXT, UUID, JSONB, TEXT) TO service_role;

-- Legacy browser writes may remain as integrity=0 display history until L04,
-- but no browser principal can manufacture v1 facts or achievements. The
-- legacy server actions deliberately stop awarding badges in this migration;
-- L03 reconnects those screens to the trusted RPC before the L04 cutover.
DROP POLICY IF EXISTS "sessions_insert_own" ON public.sessions;
CREATE POLICY "sessions_insert_own" ON public.sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id AND integrity_version = 0);
DROP POLICY IF EXISTS "sessions_update_own" ON public.sessions;
CREATE POLICY "sessions_update_own" ON public.sessions
  FOR UPDATE USING (auth.uid() = user_id AND integrity_version = 0)
  WITH CHECK (auth.uid() = user_id AND integrity_version = 0);
DROP POLICY IF EXISTS "attempts_insert_own" ON public.attempts;
CREATE POLICY "attempts_insert_own" ON public.attempts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND integrity_version = 0 AND session_item_id IS NULL
  );
DROP POLICY IF EXISTS "attempts_delete_own" ON public.attempts;
CREATE POLICY "attempts_delete_own" ON public.attempts
  FOR DELETE USING (
    auth.uid() = user_id AND integrity_version = 0 AND session_item_id IS NULL
  );
DROP POLICY IF EXISTS "user_achievements_insert_own" ON public.user_achievements;
