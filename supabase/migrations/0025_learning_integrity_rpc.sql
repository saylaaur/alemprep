-- L02: privileged, atomic writes for trusted learning facts.
-- These functions are invoked only by the server-side service-role client.

CREATE OR REPLACE FUNCTION public.start_learning_v1(
  actor_id UUID,
  operation_id UUID,
  payload_hash TEXT,
  plan JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  existing_receipt public.operation_receipts%ROWTYPE;
  session_plan JSONB;
  item_plan JSONB;
  created_session_id UUID;
  created_item_id UUID;
  version_id UUID;
  item_position INTEGER;
  created_sessions JSONB := '[]'::jsonb;
  created_item_ids JSONB;
  question_ids UUID[];
  session_count INTEGER := 0;
  item_count INTEGER;
  mode_text TEXT;
  expires_at_value TIMESTAMPTZ;
  manifest_hash_value TEXT;
  expected_manifest_hash TEXT;
  scoring_version_value TEXT;
  result JSONB;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  PERFORM pg_catalog.set_config('statement_timeout', '5s', true);
  IF actor_id IS NULL OR operation_id IS NULL OR payload_hash IS NULL OR char_length(payload_hash) = 0 THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || ':' || operation_id::text, 0));
  PERFORM 1 FROM public.profiles WHERE id = actor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_receipt
  FROM public.operation_receipts AS receipt_row
  WHERE receipt_row.actor_id = start_learning_v1.actor_id
    AND receipt_row.operation_id = start_learning_v1.operation_id;
  IF FOUND THEN
    IF existing_receipt.kind = 'learning.start' AND existing_receipt.payload_hash = start_learning_v1.payload_hash THEN
      RETURN existing_receipt.result;
    END IF;
    RETURN jsonb_build_object('error', 'operation-conflict');
  END IF;

  IF jsonb_typeof(plan) <> 'object' OR jsonb_typeof(plan->'sessions') <> 'array'
    OR jsonb_array_length(plan->'sessions') < 1 OR jsonb_array_length(plan->'sessions') > 2 THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;

  FOR session_plan IN SELECT value FROM jsonb_array_elements(plan->'sessions') LOOP
    session_count := session_count + 1;
    IF jsonb_typeof(session_plan) <> 'object' OR jsonb_typeof(session_plan->'items') <> 'array' THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END IF;
    item_count := jsonb_array_length(session_plan->'items');
    IF item_count < 1 OR item_count > 80 THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END IF;

    mode_text := session_plan->>'mode';
    IF mode_text NOT IN ('practice', 'mock_exam', 'diagnostic', 'weekly')
      OR session_plan->>'scoringVersion' <> 'ent-v1'
      OR session_plan->>'manifestHash' IS NULL OR char_length(session_plan->>'manifestHash') = 0
      OR session_plan->>'expiresAt' IS NULL THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END IF;
    BEGIN
      expires_at_value := (session_plan->>'expiresAt')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END;
    IF expires_at_value <= clock_timestamp() THEN
      RAISE EXCEPTION 'expired' USING ERRCODE = '22023';
    END IF;

    SELECT array_agg((entry.value->>'versionId')::uuid ORDER BY entry.ordinality)
    INTO question_ids
    FROM jsonb_array_elements(session_plan->'items') WITH ORDINALITY AS entry(value, ordinality);
    IF question_ids IS NULL OR cardinality(question_ids) <> item_count
      OR EXISTS (SELECT 1 FROM unnest(question_ids) AS q(id) GROUP BY id HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END IF;

    -- The server plans issued items, but the database still insists that every
    -- referenced immutable version is currently approved for new issuance.
    IF (
      SELECT count(*) FROM public.question_versions v
      JOIN public.question_publications p ON p.question_version_id = v.id
      WHERE v.id = ANY(question_ids) AND p.status = 'approved'
    ) <> item_count THEN
      RAISE EXCEPTION 'content-unavailable' USING ERRCODE = '22023';
    END IF;

    manifest_hash_value := session_plan->>'manifestHash';
    SELECT 'sha256:' || pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          string_agg(v.id::text || ':' || v.content_hash, ',' ORDER BY array_position(question_ids, v.id)),
          'UTF8'
        ),
        'sha256'::text
      ),
      'hex'
    ) INTO expected_manifest_hash
    FROM public.question_versions AS v
    WHERE v.id = ANY(question_ids);
    IF manifest_hash_value <> expected_manifest_hash THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END IF;
    scoring_version_value := session_plan->>'scoringVersion';
    INSERT INTO public.sessions (
      user_id, topic_id, subject_id, mode, total_questions, question_ids,
      integrity_version, operation_id, status, expires_at, scoring_version, manifest_hash
    ) VALUES (
      actor_id,
      NULLIF(session_plan->>'topicId', '')::uuid,
      NULLIF(session_plan->>'subjectId', '')::uuid,
      mode_text::public.session_mode,
      item_count,
      ARRAY(SELECT v.question_id FROM public.question_versions v WHERE v.id = ANY(question_ids) ORDER BY array_position(question_ids, v.id)),
      1, operation_id, 'active', expires_at_value, scoring_version_value, manifest_hash_value
    ) RETURNING id INTO created_session_id;

    created_item_ids := '[]'::jsonb;
    item_position := 0;
    FOR item_plan IN SELECT value FROM jsonb_array_elements(session_plan->'items') LOOP
      BEGIN
        version_id := (item_plan->>'versionId')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
      END;
      INSERT INTO public.session_items (session_id, question_version_id, position)
      VALUES (created_session_id, version_id, item_position)
      RETURNING id INTO created_item_id;
      created_item_ids := created_item_ids || jsonb_build_array(created_item_id);
      item_position := item_position + 1;
    END LOOP;
    created_sessions := created_sessions || jsonb_build_array(jsonb_build_object(
      'id', created_session_id,
      'mode', mode_text,
      'expiresAt', expires_at_value,
      'itemIds', created_item_ids
    ));
  END LOOP;

  result := jsonb_build_object('sessions', created_sessions);
  INSERT INTO public.operation_receipts (actor_id, operation_id, kind, payload_hash, result)
  VALUES (actor_id, operation_id, 'learning.start', payload_hash, result);
  RETURN result;
END;
$$;

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
DECLARE
  existing_receipt public.operation_receipts%ROWTYPE;
  learning_session public.sessions%ROWTYPE;
  profile_xp INTEGER;
  item JSONB;
  item_id UUID;
  version_id UUID;
  submitted_count INTEGER;
  issued_count INTEGER;
  score_value INTEGER;
  max_score_value INTEGER;
  correct_count_value INTEGER;
  xp_awarded INTEGER := 0;
  xp_today INTEGER;
  reward_amount INTEGER;
  family_id UUID;
  session_mode TEXT;
  result JSONB;
  accepted_at_value TIMESTAMPTZ := clock_timestamp();
  almaty_day DATE := timezone('Asia/Almaty', clock_timestamp())::date;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  PERFORM pg_catalog.set_config('statement_timeout', '5s', true);
  IF actor_id IS NULL OR operation_id IS NULL OR session_id IS NULL
    OR payload_hash IS NULL OR char_length(payload_hash) = 0
    OR scoring_version IS NULL THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || ':' || operation_id::text, 0));
  SELECT xp INTO profile_xp FROM public.profiles WHERE id = actor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

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

  SELECT * INTO learning_session FROM public.sessions
  WHERE id = commit_learning_v1.session_id
  FOR UPDATE;
  IF NOT FOUND OR learning_session.user_id <> actor_id OR learning_session.integrity_version <> 1
    OR learning_session.manifest_hash IS NULL OR learning_session.scoring_version IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF learning_session.scoring_version <> commit_learning_v1.scoring_version THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF learning_session.status = 'submitted' THEN
    RETURN jsonb_build_object('error', 'already-submitted');
  END IF;
  IF learning_session.status <> 'active' THEN
    RAISE EXCEPTION 'expired' USING ERRCODE = '22023';
  END IF;
  IF learning_session.expires_at IS NULL OR learning_session.expires_at <= accepted_at_value THEN
    RAISE EXCEPTION 'expired' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(graded_items) <> 'array' OR jsonb_array_length(graded_items) > 80 THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;

  -- Validate shape before casts; errors do not become partial facts.
  FOR item IN SELECT value FROM jsonb_array_elements(graded_items) LOOP
    IF jsonb_typeof(item) <> 'object'
      OR jsonb_typeof(item->'itemId') <> 'string'
      OR jsonb_typeof(item->'questionVersionId') <> 'string'
      OR jsonb_typeof(item->'points') <> 'number'
      OR jsonb_typeof(item->'maxPoints') <> 'number'
      OR jsonb_typeof(item->'timeSpentMs') <> 'number'
      OR NOT (item ? 'answer') THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END IF;
    BEGIN
      item_id := (item->>'itemId')::uuid;
      version_id := (item->>'questionVersionId')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END;
    IF (item->>'points') !~ '^[0-9]+$' OR (item->>'maxPoints') !~ '^[0-9]+$'
      OR (item->>'timeSpentMs') !~ '^[0-9]+$'
      OR (item->>'timeSpentMs')::integer > 7200000 THEN
      RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT count(*) INTO issued_count FROM public.session_items AS issued_item
  WHERE issued_item.session_id = learning_session.id;
  SELECT count(*) INTO submitted_count FROM jsonb_array_elements(graded_items);
  IF submitted_count <> issued_count OR submitted_count = 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(graded_items) value
      GROUP BY value->>'itemId' HAVING count(*) > 1
    )
    OR EXISTS (
      WITH submitted AS (
        SELECT (value->>'itemId')::uuid AS item_id, (value->>'questionVersionId')::uuid AS version_id,
          (value->>'points')::integer AS points, (value->>'maxPoints')::integer AS max_points
        FROM jsonb_array_elements(graded_items)
      )
      SELECT 1
      FROM submitted s
      FULL OUTER JOIN public.session_items si
        ON si.id = s.item_id AND si.session_id = learning_session.id
      LEFT JOIN public.question_versions qv ON qv.id = si.question_version_id
      WHERE s.item_id IS NULL OR si.id IS NULL OR s.version_id <> si.question_version_id
        OR s.max_points <> CASE qv.type WHEN 'single' THEN 1 WHEN 'multi' THEN 2 WHEN 'matching' THEN 2 END
        OR s.points > s.max_points
    ) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.attempts (
    user_id, question_id, session_id, given_answer, is_correct, time_spent_ms,
    session_item_id, integrity_version, points, max_points, attempted_at
  )
  SELECT actor_id, qv.question_id, learning_session.id, entry.value->'answer',
    (entry.value->>'points')::integer = (entry.value->>'maxPoints')::integer,
    (entry.value->>'timeSpentMs')::integer, si.id, 1,
    (entry.value->>'points')::integer, (entry.value->>'maxPoints')::integer, accepted_at_value
  FROM jsonb_array_elements(graded_items) AS entry(value)
  JOIN public.session_items si ON si.id = (entry.value->>'itemId')::uuid AND si.session_id = learning_session.id
  JOIN public.question_versions qv ON qv.id = si.question_version_id;

  SELECT coalesce(sum(points), 0)::integer, coalesce(sum(max_points), 0)::integer,
    count(*) FILTER (WHERE points = max_points)::integer
  INTO score_value, max_score_value, correct_count_value
  FROM public.attempts AS accepted_attempt
  WHERE accepted_attempt.session_id = learning_session.id AND accepted_attempt.integrity_version = 1;

  SELECT coalesce(sum(amount), 0)::integer INTO xp_today
  FROM public.reward_ledger
  WHERE user_id = actor_id AND day = almaty_day AND reward_key LIKE 'correct-family:%';
  FOR family_id IN
    SELECT qv.family_id
    FROM jsonb_array_elements(graded_items) AS entry(value)
    JOIN public.session_items si ON si.id = (entry.value->>'itemId')::uuid
    JOIN public.question_versions qv ON qv.id = si.question_version_id
    WHERE (entry.value->>'points')::integer = (entry.value->>'maxPoints')::integer
    ORDER BY si.position
  LOOP
    EXIT WHEN xp_today >= 200;
    reward_amount := NULL;
    INSERT INTO public.reward_ledger (user_id, session_id, reward_key, amount, day)
    VALUES (actor_id, learning_session.id, 'correct-family:' || family_id::text, 10, almaty_day)
    ON CONFLICT (user_id, reward_key, day) DO NOTHING
    RETURNING amount INTO reward_amount;
    IF reward_amount IS NOT NULL THEN
      xp_awarded := xp_awarded + reward_amount;
      xp_today := xp_today + reward_amount;
    END IF;
  END LOOP;

  session_mode := learning_session.mode::text;
  IF session_mode = 'mock_exam' THEN
    reward_amount := NULL;
    INSERT INTO public.reward_ledger (user_id, session_id, reward_key, amount, day)
    SELECT actor_id, learning_session.id, 'exam-bonus:' || learning_session.id::text, 50, almaty_day
    WHERE (SELECT count(*) FROM public.reward_ledger WHERE user_id = actor_id AND day = almaty_day AND reward_key LIKE 'exam-bonus:%') < 2
    ON CONFLICT (user_id, reward_key, day) DO NOTHING
    RETURNING amount INTO reward_amount;
    IF reward_amount IS NOT NULL THEN xp_awarded := xp_awarded + reward_amount; END IF;
  END IF;

  UPDATE public.profiles SET xp = profile_xp + xp_awarded WHERE id = actor_id;
  result := jsonb_build_object(
    'sessionId', learning_session.id,
    'acceptedAt', accepted_at_value,
    'score', score_value,
    'maxScore', max_score_value,
    'correctCount', correct_count_value,
    'totalQuestions', issued_count,
    'xpAwarded', xp_awarded,
    'integrityVersion', 1,
    'scoringVersion', learning_session.scoring_version
  );
  UPDATE public.sessions SET
    score = score_value, correct_count = correct_count_value, finished_at = accepted_at_value,
    status = 'submitted', receipt = result
  WHERE id = learning_session.id;
  INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, entity_id, operation_id, metadata)
  VALUES (actor_id, 'user', 'learning.submitted', 'session', learning_session.id, operation_id,
    jsonb_build_object('result', 'accepted', 'reason_code', 'normal', 'count', issued_count, 'schema_version', 'v1'));
  INSERT INTO public.operation_receipts (actor_id, operation_id, kind, payload_hash, result)
  VALUES (actor_id, operation_id, 'learning.submit', payload_hash, result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.start_learning_v1(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_learning_v1(UUID, UUID, TEXT, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_learning_v1(UUID, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_learning_v1(UUID, UUID, TEXT, UUID, JSONB, TEXT) TO service_role;
