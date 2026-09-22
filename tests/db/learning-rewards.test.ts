import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createDbHarness, type DbHarness } from './helpers';

type Seeded = {
  questionId: string;
  versionId: string;
  familyId: string;
  subjectId: string;
  topicId: string;
  manifestHash: string;
};

type Issued = { id: string; itemIds: string[] };

async function seed(db: DbHarness): Promise<Seeded> {
  const suffix = crypto.randomUUID();
  const subjectId = await db.scalar<string>(
    `INSERT INTO public.subjects (slug, name_ru, name_kk, is_active)
     VALUES ($1, 'Rewards subject', 'Сыйлық пәні', true) RETURNING id`,
    [`rewards-${suffix}`]
  );
  const topicId = await db.scalar<string>(
    `INSERT INTO public.topics (subject_id, slug, name_ru, name_kk)
     VALUES ($1, $2, 'Rewards topic', 'Сыйлық тақырыбы') RETURNING id`,
    [subjectId, `rewards-${suffix}`]
  );
  const questionId = await db.scalar<string>(
    `INSERT INTO public.questions (topic_id, language, type, body, is_published)
     VALUES ($1, 'kk', 'single', $2::jsonb, true) RETURNING id`,
    [topicId, JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }], correct: 'A' })]
  );
  const versionId = await db.scalar<string>(
    `INSERT INTO public.question_versions
       (question_id, family_id, revision, locale, type, public_body, grading_body, content_hash)
     VALUES ($1, gen_random_uuid(), 1, 'kk', 'single', $2::jsonb, $3::jsonb, $4) RETURNING id`,
    [
      questionId,
      JSON.stringify({ stem: 'public', options: [{ id: 'A', content: 'A' }] }),
      JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }], correct: 'A' }),
      `sha256:${suffix}`,
    ]
  );
  await db.execute(
    `INSERT INTO public.question_publications (question_version_id, status) VALUES ($1, 'approved')`,
    [versionId]
  );
  return {
    questionId,
    versionId,
    familyId: await db.scalar<string>('SELECT family_id FROM public.question_versions WHERE id = $1', [versionId]),
    subjectId,
    topicId,
    manifestHash: `sha256:${createHash('sha256').update(`${versionId}:sha256:${suffix}`).digest('hex')}`,
  };
}

async function seedSiblingLocale(db: DbHarness, seeded: Seeded): Promise<Seeded> {
  const suffix = crypto.randomUUID();
  const questionId = await db.scalar<string>(
    `INSERT INTO public.questions (topic_id, language, type, body, is_published)
     VALUES ($1, 'ru', 'single', $2::jsonb, true) RETURNING id`,
    [seeded.topicId, JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }], correct: 'A' })]
  );
  const versionId = await db.scalar<string>(
    `INSERT INTO public.question_versions
       (question_id, family_id, revision, locale, type, public_body, grading_body, content_hash)
     VALUES ($1, $2, 1, 'ru', 'single', $3::jsonb, $4::jsonb, $5) RETURNING id`,
    [
      questionId, seeded.familyId,
      JSON.stringify({ stem: 'public', options: [{ id: 'A', content: 'A' }] }),
      JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }], correct: 'A' }),
      `sha256:${suffix}`,
    ]
  );
  await db.execute(
    `INSERT INTO public.question_publications (question_version_id, status) VALUES ($1, 'approved')`,
    [versionId]
  );
  return {
    questionId, versionId, familyId: seeded.familyId,
    subjectId: seeded.subjectId, topicId: seeded.topicId,
    manifestHash: `sha256:${createHash('sha256').update(`${versionId}:sha256:${suffix}`).digest('hex')}`,
  };
}

async function issue(
  db: DbHarness, actorId: string, seeded: Seeded, mode: 'practice' | 'diagnostic' | 'weekly', locale: 'kk' | 'ru' = 'kk'
): Promise<Issued> {
  const durationMs = mode === 'diagnostic' ? 20 * 60 * 1_000 : mode === 'weekly' ? 40 * 60 * 1_000 : 60 * 60 * 1_000;
  const response = await db.rpc('service', 'start_learning_v1', {
    actor_id: actorId,
    operation_id: crypto.randomUUID(),
    payload_hash: `start:${mode}:${crypto.randomUUID()}`,
    plan: { sessions: [{
      mode,
      topicId: mode === 'diagnostic' ? null : seeded.topicId,
      subjectId: mode === 'diagnostic' ? null : seeded.subjectId,
      locale,
      expiresAt: new Date(Date.now() + durationMs).toISOString(),
      scoringVersion: 'ent-v1',
      manifestHash: seeded.manifestHash,
      items: [{ versionId: seeded.versionId }],
    }] },
  });
  expect(response.status, JSON.stringify(response.data)).toBe(200);
  return (response.data as { sessions: Issued[] }).sessions[0]!;
}

async function submit(db: DbHarness, actorId: string, issued: Issued, seeded: Seeded) {
  return db.rpc('service', 'commit_learning_v1', {
    actor_id: actorId,
    operation_id: crypto.randomUUID(),
    payload_hash: `submit:${crypto.randomUUID()}`,
    session_id: issued.id,
    scoring_version: 'ent-v1',
    graded_items: [{
      itemId: issued.itemIds[0], questionVersionId: seeded.versionId,
      answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1_000,
    }],
  });
}

async function backdateTrustedAttempt(db: DbHarness, sessionId: string, daysAgo: number) {
  await db.execute(
    `UPDATE public.attempts
     SET attempted_at = ((timezone('Asia/Almaty', now())::date - $2::integer) + time '12:00')
       AT TIME ZONE 'Asia/Almaty'
     WHERE session_id = $1`,
    [sessionId, daysAgo]
  );
}

async function installWeeklyFinishClock(
  db: DbHarness,
  entries: Array<{ sessionId: string; finishedAt: string }>
): Promise<() => Promise<void>> {
  await db.execute(`
    CREATE TABLE public.test_l02b_week_clock (
      session_id UUID PRIMARY KEY,
      finished_at TIMESTAMPTZ NOT NULL
    );
    GRANT SELECT ON public.test_l02b_week_clock TO service_role;
    CREATE FUNCTION public.test_l02b_week_clock() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      overridden_finished_at TIMESTAMPTZ;
    BEGIN
      SELECT clock_row.finished_at INTO overridden_finished_at
      FROM public.test_l02b_week_clock AS clock_row
      WHERE clock_row.session_id = NEW.id;
      IF FOUND THEN
        NEW.finished_at := overridden_finished_at;
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER test_l02b_week_clock
    BEFORE UPDATE OF finished_at ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.test_l02b_week_clock();
  `);
  for (const entry of entries) {
    await db.execute(
      `INSERT INTO public.test_l02b_week_clock (session_id, finished_at) VALUES ($1, $2::timestamptz)`,
      [entry.sessionId, entry.finishedAt]
    );
  }
  return async () => {
    await db.execute(`DROP TRIGGER test_l02b_week_clock ON public.sessions;
      DROP FUNCTION public.test_l02b_week_clock();
      DROP TABLE public.test_l02b_week_clock;`);
  };
}

describe('L02b trusted learning rewards', () => {
  let db: DbHarness | undefined;
  let actorId: string | undefined;

  afterEach(async () => {
    if (actorId) {
      await db?.execute('DELETE FROM public.user_achievements WHERE user_id = $1', [actorId]);
      await db?.execute('DELETE FROM public.attempts WHERE user_id = $1', [actorId]);
      await db?.execute('DELETE FROM public.session_items WHERE session_id IN (SELECT id FROM public.sessions WHERE user_id = $1)', [actorId]);
      await db?.execute('DELETE FROM public.reward_ledger WHERE user_id = $1', [actorId]);
      await db?.execute('DELETE FROM public.audit_events WHERE actor_id = $1', [actorId]);
      await db?.execute('DELETE FROM public.operation_receipts WHERE actor_id = $1', [actorId]);
      await db?.execute('DELETE FROM public.sessions WHERE user_id = $1', [actorId]);
    }
    await db?.close();
    db = undefined;
    actorId = undefined;
  });

  it('records a diagnostic attempt without XP, streak, reward or achievement', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-diagnostic');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'diagnostic');

    const receipt = await submit(db, actor.id, issued, seeded);

    expect(receipt.status, JSON.stringify(receipt.data)).toBe(200);
    expect(receipt.data).toMatchObject({ xpAwarded: 0 });
    expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(0);
    expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(0);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.reward_ledger WHERE user_id = $1', [actor.id])).toBe(0);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.user_achievements WHERE user_id = $1', [actor.id])).toBe(0);
    expect(await db.scalar<number>(
      `SELECT (receipt->>'xpAwarded')::int FROM public.sessions WHERE id = $1`, [issued.id]
    )).toBe(0);
  });

  it('awards trusted practice XP, starts a local-day streak and earns first-question once', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-practice');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'practice');

    const receipt = await submit(db, actor.id, issued, seeded);

    expect(receipt.status, JSON.stringify(receipt.data)).toBe(200);
    expect(receipt.data).toMatchObject({ xpAwarded: 10 });
    expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(10);
    expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(1);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.user_achievements WHERE user_id = $1 AND achievement_key = 'first-question'`, [actor.id]
    )).toBe(1);
  });

  it('awards one correct-family reward across Kazakh and Russian versions', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-family-locales');
    actorId = actor.id;
    const kk = await seed(db);
    const ru = await seedSiblingLocale(db, kk);

    const first = await submit(db, actor.id, await issue(db, actor.id, kk, 'practice'), kk);
    const second = await submit(db, actor.id, await issue(db, actor.id, ru, 'practice', 'ru'), ru);

    expect(first.status, JSON.stringify(first.data)).toBe(200);
    expect(second.status, JSON.stringify(second.data)).toBe(200);
    expect(first.data).toMatchObject({ xpAwarded: 10 });
    expect(second.data).toMatchObject({ xpAwarded: 0 });
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.reward_ledger WHERE user_id = $1 AND reward_key = $2`,
      [actor.id, `correct-family:${kk.familyId}`]
    )).toBe(1);
  });

  it('adds one weekly completion bonus with an Almaty ISO-week reward key', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-weekly');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'weekly');

    const receipt = await submit(db, actor.id, issued, seeded);

    expect(receipt.status, JSON.stringify(receipt.data)).toBe(200);
    expect(receipt.data).toMatchObject({ xpAwarded: 40 });
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.reward_ledger WHERE user_id = $1 AND reward_key ~ '^weekly-bonus:[0-9]{4}-W[0-9]{2}$'`, [actor.id]
    )).toBe(1);
  });

  it('adds one weekly bonus across two accepted sessions on different Almaty days in one ISO week', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-weekly-once');
    actorId = actor.id;
    const seeded = await seed(db);
    const first = await issue(db, actor.id, seeded, 'weekly');
    const second = await issue(db, actor.id, seeded, 'weekly');
    const cleanupClock = await installWeeklyFinishClock(db, [
      { sessionId: first.id, finishedAt: '2026-01-05T06:00:00Z' },
      { sessionId: second.id, finishedAt: '2026-01-07T06:00:00Z' },
    ]);
    try {
      const firstReceipt = await submit(db, actor.id, first, seeded);
      const secondReceipt = await submit(db, actor.id, second, seeded);

      expect(firstReceipt.status, JSON.stringify(firstReceipt.data)).toBe(200);
      expect(secondReceipt.status, JSON.stringify(secondReceipt.data)).toBe(200);
      expect(firstReceipt.data).toMatchObject({ xpAwarded: 40 });
      // The correct-family row is created by L02a with the real transaction
      // day, so the second session has no +10. This assertion isolates the
      // weekly rule: a different controlled Almaty day in W02 gets no +30.
      expect(secondReceipt.data).toMatchObject({ xpAwarded: 0 });
      expect(await db.scalar<number>(
        `SELECT count(*)::int FROM public.reward_ledger
         WHERE user_id = $1 AND reward_key = 'weekly-bonus:2026-W02'`, [actor.id]
      )).toBe(1);
    } finally {
      await cleanupClock();
    }
  });

  it('adds weekly bonus again for an accepted session in the next Almaty ISO week', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-weekly-new-week');
    actorId = actor.id;
    const seeded = await seed(db);
    const first = await issue(db, actor.id, seeded, 'weekly');
    const second = await issue(db, actor.id, seeded, 'weekly');
    const cleanupClock = await installWeeklyFinishClock(db, [
      { sessionId: first.id, finishedAt: '2026-01-05T06:00:00Z' },
      { sessionId: second.id, finishedAt: '2026-01-12T06:00:00Z' },
    ]);
    try {
      const firstReceipt = await submit(db, actor.id, first, seeded);
      const secondReceipt = await submit(db, actor.id, second, seeded);

      expect(firstReceipt.status, JSON.stringify(firstReceipt.data)).toBe(200);
      expect(secondReceipt.status, JSON.stringify(secondReceipt.data)).toBe(200);
      expect(firstReceipt.data).toMatchObject({ xpAwarded: 40 });
      // Same-family daily credit remains consumed by L02a; the +30 proves
      // L02b derives a new weekly key from the accepted session's week.
      expect(secondReceipt.data).toMatchObject({ xpAwarded: 30 });
      expect(await db.scalar<number>(
        `SELECT count(*)::int FROM public.reward_ledger
         WHERE user_id = $1 AND reward_key IN ('weekly-bonus:2026-W02', 'weekly-bonus:2026-W03')`, [actor.id]
      )).toBe(2);
    } finally {
      await cleanupClock();
    }
  });

  it('uses the Asia/Almaty ISO week across the UTC midnight boundary', async () => {
    db = await createDbHarness();
    const before = await db.scalar<string>(
      `SELECT to_char(timezone('Asia/Almaty', $1::timestamptz)::date, 'IYYY')
        || '-W' || to_char(timezone('Asia/Almaty', $1::timestamptz)::date, 'IW')`,
      ['2026-01-04T18:59:59Z']
    );
    const after = await db.scalar<string>(
      `SELECT to_char(timezone('Asia/Almaty', $1::timestamptz)::date, 'IYYY')
        || '-W' || to_char(timezone('Asia/Almaty', $1::timestamptz)::date, 'IW')`,
      ['2026-01-04T19:00:00Z']
    );

    expect(before).toBe('2026-W01');
    expect(after).toBe('2026-W02');
  });

  it('does not turn a legacy display streak into a trusted streak achievement', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-legacy-streak');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'practice');
    await db.execute(
      `UPDATE public.profiles
       SET current_streak = 29, longest_streak = 29,
         last_active_date = timezone('Asia/Almaty', now())::date - 1
       WHERE id = $1`,
      [actor.id]
    );

    const receipt = await submit(db, actor.id, issued, seeded);

    expect(receipt.status, JSON.stringify(receipt.data)).toBe(200);
    expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(30);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.user_achievements
       WHERE user_id = $1 AND achievement_key IN ('streak-7', 'streak-30')`, [actor.id]
    )).toBe(0);
  });

  it('awards streak-7 only for seven consecutive trusted Almaty days', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-trusted-streak');
    actorId = actor.id;
    const seeded = await seed(db);
    for (let daysAgo = 1; daysAgo <= 6; daysAgo += 1) {
      const historical = await issue(db, actor.id, seeded, 'practice');
      const receipt = await submit(db, actor.id, historical, seeded);
      expect(receipt.status, JSON.stringify(receipt.data)).toBe(200);
      await backdateTrustedAttempt(db, historical.id, daysAgo);
    }
    await db.execute(
      `UPDATE public.profiles
       SET current_streak = 6, longest_streak = 6,
         last_active_date = timezone('Asia/Almaty', now())::date - 1
       WHERE id = $1`, [actor.id]
    );

    const today = await submit(db, actor.id, await issue(db, actor.id, seeded, 'practice'), seeded);

    expect(today.status, JSON.stringify(today.data)).toBe(200);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.user_achievements
       WHERE user_id = $1 AND achievement_key = 'streak-7'`, [actor.id]
    )).toBe(1);
  }, 60_000);

  it('does not award streak-7 for scattered trusted days despite a display streak', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-scattered-streak');
    actorId = actor.id;
    const seeded = await seed(db);
    for (const daysAgo of [2, 4, 6, 8, 10, 12]) {
      const historical = await issue(db, actor.id, seeded, 'practice');
      const receipt = await submit(db, actor.id, historical, seeded);
      expect(receipt.status, JSON.stringify(receipt.data)).toBe(200);
      await backdateTrustedAttempt(db, historical.id, daysAgo);
    }
    await db.execute(
      `UPDATE public.profiles
       SET current_streak = 6, longest_streak = 6,
         last_active_date = timezone('Asia/Almaty', now())::date - 1
       WHERE id = $1`, [actor.id]
    );

    const today = await submit(db, actor.id, await issue(db, actor.id, seeded, 'practice'), seeded);

    expect(today.status, JSON.stringify(today.data)).toBe(200);
    expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(7);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.user_achievements
       WHERE user_id = $1 AND achievement_key = 'streak-7'`, [actor.id]
    )).toBe(0);
  }, 60_000);

  it('does not let diagnostic history unlock topic mastery during later practice', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-diagnostic-history');
    actorId = actor.id;
    const seeded = await seed(db);
    for (let index = 0; index < 10; index += 1) {
      const diagnostic = await submit(db, actor.id, await issue(db, actor.id, seeded, 'diagnostic'), seeded);
      expect(diagnostic.status, JSON.stringify(diagnostic.data)).toBe(200);
    }

    const practice = await submit(db, actor.id, await issue(db, actor.id, seeded, 'practice'), seeded);

    expect(practice.status, JSON.stringify(practice.data)).toBe(200);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.user_achievements
       WHERE user_id = $1 AND achievement_key = 'topic-mastery'`, [actor.id]
    )).toBe(0);
  });

  it('uses one freeze and awards its seven-day replacement atomically', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-freeze');
    actorId = actor.id;
    const seeded = await seed(db);
    await db.execute(
      `UPDATE public.profiles
       SET current_streak = 6, longest_streak = 6, streak_freezes = 1,
         last_active_date = timezone('Asia/Almaty', now())::date - 2
       WHERE id = $1`, [actor.id]
    );

    const receipt = await submit(db, actor.id, await issue(db, actor.id, seeded, 'practice'), seeded);

    expect(receipt.status, JSON.stringify(receipt.data)).toBe(200);
    expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(7);
    expect(await db.scalar<number>('SELECT streak_freezes FROM public.profiles WHERE id = $1', [actor.id])).toBe(1);
    expect(await db.scalar<string>(
      `SELECT last_freeze_used_date::text FROM public.profiles WHERE id = $1`, [actor.id]
    )).toBe(await db.scalar<string>(`SELECT timezone('Asia/Almaty', now())::date::text`));
  });

  it('does not spend or award freezes twice when two sessions submit concurrently', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-concurrent-freeze');
    actorId = actor.id;
    const seeded = await seed(db);
    await db.execute(
      `UPDATE public.profiles
       SET current_streak = 6, longest_streak = 6, streak_freezes = 1,
         last_active_date = timezone('Asia/Almaty', now())::date - 2
       WHERE id = $1`, [actor.id]
    );
    const [first, second] = await Promise.all([
      submit(db, actor.id, await issue(db, actor.id, seeded, 'practice'), seeded),
      submit(db, actor.id, await issue(db, actor.id, seeded, 'practice'), seeded),
    ]);

    expect([first.status, second.status], JSON.stringify([first.data, second.data])).toEqual([200, 200]);
    expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(7);
    expect(await db.scalar<number>('SELECT longest_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(7);
    expect(await db.scalar<number>('SELECT streak_freezes FROM public.profiles WHERE id = $1', [actor.id])).toBe(1);
    expect(await db.scalar<string>(
      `SELECT last_freeze_used_date::text FROM public.profiles WHERE id = $1`, [actor.id]
    )).toBe(await db.scalar<string>(`SELECT timezone('Asia/Almaty', now())::date::text`));
  });

  it('denies browser writes that would forge trusted facts or achievements', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-browser-denial');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'practice');

    const forgedAttempt = await db.rest(actor, '/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: actor.id, question_id: seeded.questionId, session_id: issued.id,
        session_item_id: issued.itemIds[0], given_answer: 'A', is_correct: true,
        integrity_version: 1, points: 1, max_points: 1,
      }),
    });
    const forgedAchievement = await db.rest(actor, '/user_achievements', {
      method: 'POST',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: actor.id, achievement_key: 'solved-500' }),
    });

    expect(forgedAttempt.status).toBeGreaterThanOrEqual(400);
    expect(forgedAchievement.status).toBeGreaterThanOrEqual(400);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE user_id = $1', [actor.id])).toBe(0);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.user_achievements WHERE user_id = $1', [actor.id])).toBe(0);
  });

  it('rolls back attempts, rewards, profile and receipt if trusted achievement write fails', async () => {
    db = await createDbHarness();
    const actor = await db.actor('rewards-atomic');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'practice');
    const auditBefore = await db.scalar<number>(
      'SELECT count(*)::int FROM public.audit_events WHERE actor_id = $1', [actor.id]
    );
    const achievementsBefore = await db.scalar<number>(
      'SELECT count(*)::int FROM public.user_achievements WHERE user_id = $1', [actor.id]
    );
    await db.execute(
      `CREATE FUNCTION public.test_l02b_fail_achievement()
       RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test achievement failure'; END; $$;
       CREATE TRIGGER test_l02b_fail_achievement
       BEFORE INSERT ON public.user_achievements
       FOR EACH ROW WHEN (NEW.user_id = '${actor.id}'::uuid)
       EXECUTE FUNCTION public.test_l02b_fail_achievement();`
    );
    try {
      const receipt = await submit(db, actor.id, issued, seeded);

      expect(receipt.status).toBe(400);
      expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(0);
      expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(0);
      expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE user_id = $1', [actor.id])).toBe(0);
      expect(await db.scalar<number>('SELECT count(*)::int FROM public.reward_ledger WHERE user_id = $1', [actor.id])).toBe(0);
      expect(await db.scalar<number>(
        'SELECT count(*)::int FROM public.audit_events WHERE actor_id = $1', [actor.id]
      )).toBe(auditBefore);
      expect(await db.scalar<number>(
        'SELECT count(*)::int FROM public.user_achievements WHERE user_id = $1', [actor.id]
      )).toBe(achievementsBefore);
      expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [issued.id])).toBe('active');
      expect(await db.scalar<number>('SELECT count(*)::int FROM public.operation_receipts WHERE actor_id = $1', [actor.id])).toBe(1);
    } finally {
      await db.execute('DROP TRIGGER IF EXISTS test_l02b_fail_achievement ON public.user_achievements; DROP FUNCTION IF EXISTS public.test_l02b_fail_achievement()');
    }
  });
});
