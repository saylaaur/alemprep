import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createDbHarness, type DbHarness } from './helpers';

type Seeded = {
  questionId: string;
  versionId: string;
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
    subjectId,
    topicId,
    manifestHash: `sha256:${createHash('sha256').update(`${versionId}:sha256:${suffix}`).digest('hex')}`,
  };
}

async function issue(db: DbHarness, actorId: string, seeded: Seeded, mode: 'practice' | 'diagnostic' | 'weekly'): Promise<Issued> {
  const durationMs = mode === 'diagnostic' ? 20 * 60 * 1_000 : mode === 'weekly' ? 40 * 60 * 1_000 : 60 * 60 * 1_000;
  const response = await db.rpc('service', 'start_learning_v1', {
    actor_id: actorId,
    operation_id: crypto.randomUUID(),
    payload_hash: `start:${mode}:${crypto.randomUUID()}`,
    plan: { sessions: [{
      mode,
      topicId: mode === 'diagnostic' ? null : seeded.topicId,
      subjectId: mode === 'diagnostic' ? null : seeded.subjectId,
      locale: 'kk',
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

describe('Astra L02b review probes', () => {
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


  it('rejects authenticated and anonymous deletion of an accepted trusted attempt', async () => {
    db = await createDbHarness();
    const actor = await db.actor('review-trusted-delete');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'practice');
    const accepted = await submit(db, actor.id, issued, seeded);
    expect(accepted.status, JSON.stringify(accepted.data)).toBe(200);
    const removed = await db.rest(actor, `/attempts?session_id=eq.${issued.id}`, {
      method: 'DELETE', headers: { prefer: 'return=representation' },
    });
    const anonymous = await db.rest(null, `/attempts?session_id=eq.${issued.id}`, {
      method: 'DELETE', headers: { prefer: 'return=representation' },
    });
    // PostgREST represents an RLS-filtered DELETE as an empty successful
    // mutation, while an unauthenticated caller may receive 401/403.
    expect(removed.status).toBe(200);
    expect(removed.data).toEqual([]);
    expect(anonymous.status).toBeGreaterThanOrEqual(200);
    expect(await db.scalar<number>(
      'SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [issued.id]
    ), JSON.stringify(removed)).toBe(1);
  });

  it('returns a concurrent receipt replay without another profile write', async () => {
    db = await createDbHarness();
    const actor = await db.actor('review-concurrent-replay');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'practice');
    const op = crypto.randomUUID();
    const args = {
      actor_id: actor.id, operation_id: op, payload_hash: 'review-same-submit',
      session_id: issued.id, scoring_version: 'ent-v1',
      graded_items: [{ itemId: issued.itemIds[0], questionVersionId: seeded.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1_000 }],
    };
    await db.execute(`
      CREATE TABLE public.test_l02b_review_profile_writes (id integer);
      GRANT INSERT ON public.test_l02b_review_profile_writes TO service_role;
      CREATE FUNCTION public.test_l02b_review_profile_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO public.test_l02b_review_profile_writes VALUES (1); RETURN NEW; END; $$;
      CREATE TRIGGER test_l02b_review_profile_write AFTER UPDATE ON public.profiles
      FOR EACH ROW WHEN (NEW.id = '${actor.id}'::uuid)
      EXECUTE FUNCTION public.test_l02b_review_profile_write();
    `);
    const locker = await db.connection();
    const requests: ReturnType<DbHarness['rpc']>[] = [];
    try {
      await locker.execute('BEGIN');
      await locker.execute(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${actor.id}:${op}`]);
      requests.push(db.rpc('service', 'commit_learning_v1', args), db.rpc('service', 'commit_learning_v1', args));
      let waiting = 0;
      const deadline = Date.now() + 1_500;
      while (Date.now() < deadline) {
        waiting = await db.scalar<number>(`SELECT count(*)::int FROM pg_locks
          WHERE locktype = 'advisory' AND NOT granted`);
        if (waiting >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(2);
      await locker.execute('COMMIT');
      const responses = await Promise.all(requests);
      expect(responses.map((r) => r.status), JSON.stringify(responses)).toEqual([200, 200]);
      expect(responses[1]!.data).toEqual(responses[0]!.data);
      // A single accepted submit writes XP in L02a, then streak in L02b.
      // A replay must not perform a third profile UPDATE.
      expect(await db.scalar<number>('SELECT count(*)::int FROM public.test_l02b_review_profile_writes')).toBe(2);
    } finally {
      await locker.execute('ROLLBACK');
      locker.release();
      await Promise.allSettled(requests);
      await db.execute(`DROP TRIGGER test_l02b_review_profile_write ON public.profiles;
        DROP FUNCTION public.test_l02b_review_profile_write();
        DROP TABLE public.test_l02b_review_profile_writes;`);
    }
  });

  it('returns an accepted receipt unchanged after its session crosses into a later Almaty day', async () => {
    db = await createDbHarness();
    const actor = await db.actor('review-next-day-replay');
    actorId = actor.id;
    const seeded = await seed(db);
    const issued = await issue(db, actor.id, seeded, 'practice');
    const args = {
      actor_id: actor.id, operation_id: crypto.randomUUID(), payload_hash: 'review-next-day-submit',
      session_id: issued.id, scoring_version: 'ent-v1',
      graded_items: [{ itemId: issued.itemIds[0], questionVersionId: seeded.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1_000 }],
    };
    const first = await db.rpc('service', 'commit_learning_v1', args);
    expect(first.status, JSON.stringify(first.data)).toBe(200);
    const storedReceipt = await db.scalar<string>(
      'SELECT receipt::text FROM public.sessions WHERE id = $1', [issued.id]
    );
    await db.execute(
      `UPDATE public.sessions SET finished_at = finished_at - interval '1 day' WHERE id = $1`,
      [issued.id]
    );
    await db.execute(
      `UPDATE public.profiles SET xp = 313, current_streak = 17 WHERE id = $1`,
      [actor.id]
    );

    const replay = await db.rpc('service', 'commit_learning_v1', args);

    expect(replay.status, JSON.stringify(replay.data)).toBe(200);
    expect(replay.data).toEqual(first.data);
    expect(await db.scalar<string>('SELECT receipt::text FROM public.sessions WHERE id = $1', [issued.id])).toBe(storedReceipt);
    expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(313);
    expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(17);
  });

  it('caps concurrent distinct-family practice rewards at 200 XP per Almaty day', async () => {
    db = await createDbHarness();
    const actor = await db.actor('review-daily-cap');
    actorId = actor.id;
    const firstSeed = await seed(db);
    const secondSeed = await seed(db);
    const first = await issue(db, actor.id, firstSeed, 'practice');
    const second = await issue(db, actor.id, secondSeed, 'practice');
    for (let index = 0; index < 19; index += 1) {
      await db.execute(
        `INSERT INTO public.reward_ledger (user_id, session_id, reward_key, amount, day)
         VALUES ($1, $2, $3, 10, timezone('Asia/Almaty', now())::date)`,
        [actor.id, first.id, `correct-family:review-prefill-${index}`]
      );
    }

    const [firstReceipt, secondReceipt] = await Promise.all([
      submit(db, actor.id, first, firstSeed),
      submit(db, actor.id, second, secondSeed),
    ]);

    expect([firstReceipt.status, secondReceipt.status], JSON.stringify([firstReceipt.data, secondReceipt.data]))
      .toEqual([200, 200]);
    expect([firstReceipt.data, secondReceipt.data].map((receipt) =>
      (receipt as { xpAwarded: number }).xpAwarded
    ).sort()).toEqual([0, 10]);
    expect(await db.scalar<number>(
      `SELECT coalesce(sum(amount), 0)::int FROM public.reward_ledger
       WHERE user_id = $1 AND day = timezone('Asia/Almaty', now())::date
         AND reward_key LIKE 'correct-family:%'`, [actor.id]
    )).toBe(200);
    expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(10);
  });
});
