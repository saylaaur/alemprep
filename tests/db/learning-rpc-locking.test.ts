import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createDbHarness, type DbHarness } from './helpers';
import { expectUnchangedLearning, learningFacts } from './learning-facts';

type SeededLearning = {
  questionId: string;
  versionId: string;
  topicId: string;
  subjectId: string;
  manifestHash: string;
};

type IssuedSession = {
  id: string;
  itemIds: string[];
};

async function seedApprovedVersion(db: DbHarness): Promise<SeededLearning> {
  const suffix = crypto.randomUUID();
  const subjectId = await db.scalar<string>(
    `INSERT INTO public.subjects (slug, name_ru, name_kk, is_active)
     VALUES ($1, 'Lock subject', 'Lock пәні', true) RETURNING id`,
    [`locking-${suffix}`]
  );
  const topicId = await db.scalar<string>(
    `INSERT INTO public.topics (subject_id, slug, name_ru, name_kk)
     VALUES ($1, $2, 'Lock topic', 'Lock тақырыбы') RETURNING id`,
    [subjectId, `locking-${suffix}`]
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
    `INSERT INTO public.question_publications (question_version_id, status)
     VALUES ($1, 'approved')`,
    [versionId]
  );
  return {
    questionId,
    versionId,
    topicId,
    subjectId,
    manifestHash: `sha256:${createHash('sha256').update(`${versionId}:sha256:${suffix}`).digest('hex')}`,
  };
}

function startPlan(seeded: SeededLearning) {
  return {
    sessions: [{
      mode: 'practice',
      topicId: seeded.topicId,
      subjectId: seeded.subjectId,
      locale: 'kk',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scoringVersion: 'ent-v1',
      manifestHash: seeded.manifestHash,
      items: [{ versionId: seeded.versionId }],
    }],
  };
}

function submittedItem(session: IssuedSession, seeded: SeededLearning) {
  return [{
    itemId: session.itemIds[0],
    questionVersionId: seeded.versionId,
    answer: 'A',
    points: 1,
    maxPoints: 1,
    timeSpentMs: 1_000,
  }];
}

async function waitForLock(db: DbHarness, queryFragment: string, blockerPid: number): Promise<number> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const waiting = await db.scalar<number | null>(
      `SELECT pid
         FROM pg_catalog.pg_stat_activity
         WHERE state = 'active'
           AND wait_event_type = 'Lock'
           AND query ILIKE $1
           AND $2 = ANY(pg_catalog.pg_blocking_pids(pid))
         LIMIT 1`,
      [`%${queryFragment}%`, blockerPid]
    );
    if (waiting !== null) return waiting;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${queryFragment} was not observed blocked by backend ${blockerPid}`);
}

async function expectNoSubmitFacts(db: DbHarness, actorId: string, sessionId: string): Promise<void> {
  expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [sessionId]))
    .toBe(0);
  expect(await db.scalar<number>('SELECT count(*)::int FROM public.reward_ledger WHERE user_id = $1', [actorId]))
    .toBe(0);
  expect(await db.scalar<number>(
    `SELECT count(*)::int FROM public.operation_receipts
     WHERE actor_id = $1 AND kind = 'learning.submit'`, [actorId]
  )).toBe(0);
  expect(await db.scalar<number>(
    `SELECT count(*)::int FROM public.audit_events
     WHERE entity_id = $1 AND event_type = 'learning.submitted'`, [sessionId]
  )).toBe(0);
  expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actorId])).toBe(0);
  expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [sessionId])).toBe('active');
}

describe('L02a-R publication locking', () => {
  let db: DbHarness | undefined;
  let actorId: string | undefined;
  let pending: Promise<unknown>[] = [];

  afterEach(async () => {
    // Every test releases its locks in finally before outstanding HTTP/SQL work
    // drains. Never delete fixture rows while a failed barrier still has a writer.
    await Promise.allSettled(pending);
    pending = [];
    if (actorId) {
      await db?.execute('DELETE FROM public.attempts WHERE user_id = $1', [actorId]);
      await db?.execute(
        `DELETE FROM public.session_items
         WHERE session_id IN (SELECT id FROM public.sessions WHERE user_id = $1)`,
        [actorId]
      );
      await db?.execute('DELETE FROM public.reward_ledger WHERE user_id = $1', [actorId]);
      await db?.execute('DELETE FROM public.sessions WHERE user_id = $1', [actorId]);
      await db?.execute('DELETE FROM public.operation_receipts WHERE actor_id = $1', [actorId]);
    }
    await db?.close();
    db = undefined;
    actorId = undefined;
  });

  it('waits for quarantine before issuing a session and then refuses the unavailable version', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-lock-start-quarantine');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const before = await learningFacts(db, actor.id);
    const locker = await db.connection();
    let transactionOpen = false;

    try {
      await locker.execute('BEGIN');
      transactionOpen = true;
      await locker.execute(
        `UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1`,
        [seeded.versionId]
      );
      const started = db.rpc('service', 'start_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'start:blocked-by-quarantine',
        plan: startPlan(seeded),
      });
      pending.push(started);
      await waitForLock(db, 'start_learning_v1', locker.backendPid);
      await locker.execute('COMMIT');
      transactionOpen = false;

      const response = await started;
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data).toMatchObject({ message: 'content-unavailable' });
      await expectUnchangedLearning(db, actor.id, before);
      expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id]))
        .toBe(0);
      expect(await db.scalar<number>(
        `SELECT count(*)::int FROM public.operation_receipts
         WHERE actor_id = $1 AND kind = 'learning.start'`, [actor.id]
      )).toBe(0);
      expect(await db.scalar<number>(
        `SELECT count(*)::int FROM public.audit_events
         WHERE actor_id = $1 AND event_type = 'learning.started'`, [actor.id]
      )).toBe(0);
    } finally {
      if (transactionOpen) await locker.execute('ROLLBACK');
      locker.release();
    }
  });

  it('waits for quarantine before submission and leaves the issued session unchanged', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-lock-submit-quarantine');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const issued = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:before-submit-lock',
      plan: startPlan(seeded),
    });
    expect(issued.status, JSON.stringify(issued.data)).toBe(200);
    const session = (issued.data as { sessions: IssuedSession[] }).sessions[0]!;
    const before = await learningFacts(db, actor.id);
    const locker = await db.connection();
    let transactionOpen = false;

    try {
      await locker.execute('BEGIN');
      transactionOpen = true;
      await locker.execute(
        `UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1`,
        [seeded.versionId]
      );
      const submitted = db.rpc('service', 'commit_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:blocked-by-quarantine',
        session_id: session.id,
        scoring_version: 'ent-v1',
        graded_items: submittedItem(session, seeded),
      });
      pending.push(submitted);
      await waitForLock(db, 'commit_learning_v1', locker.backendPid);
      await locker.execute('COMMIT');
      transactionOpen = false;

      const response = await submitted;
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data).toMatchObject({ message: 'content-unavailable' });
      await expectNoSubmitFacts(db, actor.id, session.id);
      await expectUnchangedLearning(db, actor.id, before);
    } finally {
      if (transactionOpen) await locker.execute('ROLLBACK');
      locker.release();
    }
  });

  it.each(['start', 'submit'] as const)('serializes %s-first before quarantine and preserves its receipt on retry', async (kind) => {
    db = await createDbHarness();
    const actor = await db.actor('learning-lock-start-first');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const initial = kind === 'submit' ? await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id, operation_id: crypto.randomUUID(), payload_hash: 'start:before-submit-first', plan: startPlan(seeded),
    }) : undefined;
    if (initial) expect(initial.status, JSON.stringify(initial.data)).toBe(200);
    const issuedSession = initial ? (initial.data as { sessions: IssuedSession[] }).sessions[0]! : undefined;
    const operationId = crypto.randomUUID();
    const rpcName = kind === 'start' ? 'start_learning_v1' : 'commit_learning_v1';
    const args = kind === 'start' ? {
      actor_id: actor.id, operation_id: operationId, payload_hash: 'start:first-lock', plan: startPlan(seeded),
    } : {
      actor_id: actor.id, operation_id: operationId, payload_hash: 'submit:first-lock',
      session_id: issuedSession!.id, scoring_version: 'ent-v1', graded_items: submittedItem(issuedSession!, seeded),
    };
    const barrier = await db.connection();
    const quarantine = await db.connection();
    const advisoryKey = 98_271;
    let barrierHeld = false;
    let triggerInstalled = false;
    let startPromise: Promise<Awaited<ReturnType<DbHarness['rpc']>>> | undefined;
    let quarantinePromise: Promise<void> | undefined;

    try {
      await db.execute(`
        CREATE OR REPLACE FUNCTION public.l02ar_pause_start_audit()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.operation_id = '${operationId}'::uuid THEN
            PERFORM pg_catalog.pg_advisory_xact_lock(${advisoryKey});
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER l02ar_pause_start_audit
        BEFORE INSERT ON public.audit_events
        FOR EACH ROW EXECUTE FUNCTION public.l02ar_pause_start_audit();
      `);
      triggerInstalled = true;
      await barrier.execute(`SELECT pg_catalog.pg_advisory_lock(${advisoryKey})`);
      barrierHeld = true;
      startPromise = db.rpc('service', rpcName, args);
      const learningPid = await waitForLock(db, rpcName, barrier.backendPid);
      quarantinePromise = quarantine.execute(
        `UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1`,
        [seeded.versionId]
      );
      // Attach failure handling before awaiting a barrier, so a timeout cannot
      // become an unhandled rejection during cleanup.
      void quarantinePromise.catch(() => undefined);
      await waitForLock(db, 'UPDATE public.question_publications', learningPid);
      await barrier.execute(`SELECT pg_catalog.pg_advisory_unlock(${advisoryKey})`);
      barrierHeld = false;

      const started = await startPromise;
      expect(started.status, JSON.stringify(started.data)).toBe(200);
      await quarantinePromise;
      const session = issuedSession ?? (started.data as { sessions: IssuedSession[] }).sessions[0]!;
      const beforeReplay = await learningFacts(db, actor.id);
      const replay = await db.rpc('service', rpcName, args);
      expect(replay.status).toBe(200);
      expect(replay.data).toEqual(started.data);
      await expectUnchangedLearning(db, actor.id, beforeReplay);
      const rejected = await db.rpc('service', 'commit_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:after-start-first-quarantine',
        session_id: session.id,
        scoring_version: 'ent-v1',
        graded_items: submittedItem(session, seeded),
      });
      if (kind === 'start') {
        expect(rejected.status).toBeGreaterThanOrEqual(400);
        expect(rejected.data).toMatchObject({ message: 'content-unavailable' });
        await expectNoSubmitFacts(db, actor.id, session.id);
      } else {
        expect(started.data).toMatchObject({ score: 1, maxScore: 1 });
        expect(rejected.status).toBe(200);
        expect(rejected.data).toEqual({ error: 'already-submitted' });
        expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id])).toBe(1);
        expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(10);
      }
      await expectUnchangedLearning(db, actor.id, beforeReplay);
    } finally {
      if (barrierHeld) await barrier.execute(`SELECT pg_catalog.pg_advisory_unlock(${advisoryKey})`);
      if (startPromise) await startPromise.catch(() => undefined);
      if (quarantinePromise) await quarantinePromise.catch(() => undefined);
      if (triggerInstalled) {
        await db.execute('DROP TRIGGER IF EXISTS l02ar_pause_start_audit ON public.audit_events');
        await db.execute('DROP FUNCTION IF EXISTS public.l02ar_pause_start_audit()');
      }
      barrier.release();
      quarantine.release();
    }
  });

  it('rejects a deadline that naturally passes while waiting on publication after reading the session', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-lock-expiry');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const issued = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:before-expiry-lock',
      plan: startPlan(seeded),
    });
    expect(issued.status, JSON.stringify(issued.data)).toBe(200);
    const session = (issued.data as { sessions: IssuedSession[] }).sessions[0]!;
    const locker = await db.connection();
    let transactionOpen = false;

    try {
      await locker.execute('BEGIN');
      transactionOpen = true;
      await locker.execute('SELECT 1 FROM public.question_publications WHERE question_version_id = $1 FOR UPDATE', [seeded.versionId]);
      // Set the deadline once, before submit. The RPC reads this session then
      // waits on publication; only wall-clock time changes while it is blocked.
      await db.execute("UPDATE public.sessions SET expires_at = clock_timestamp() + interval '1200 milliseconds' WHERE id = $1", [session.id]);
      const before = await learningFacts(db, actor.id);
      const submitted = db.rpc('service', 'commit_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:expires-while-waiting',
        session_id: session.id,
        scoring_version: 'ent-v1',
        graded_items: submittedItem(session, seeded),
      });
      pending.push(submitted);
      const pid = await waitForLock(db, 'commit_learning_v1', locker.backendPid);
      expect(await db.scalar<boolean>(`
        SELECT a.query_start < s.expires_at AND clock_timestamp() < s.expires_at
        FROM pg_stat_activity a CROSS JOIN public.sessions s WHERE a.pid = $1 AND s.id = $2`, [pid, session.id])).toBe(true);
      await expect.poll(() => db!.scalar<boolean>(
        'SELECT clock_timestamp() >= expires_at FROM public.sessions WHERE id = $1', [session.id]
      ), { timeout: 1700, interval: 20 }).toBe(true);
      expect(await db.scalar<boolean>('SELECT $1 = ANY(pg_blocking_pids($2))', [locker.backendPid, pid])).toBe(true);
      await locker.execute('COMMIT');
      transactionOpen = false;

      const response = await submitted;
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data).toMatchObject({ message: 'expired' });
      await expectNoSubmitFacts(db, actor.id, session.id);
      await expectUnchangedLearning(db, actor.id, before);
    } finally {
      if (transactionOpen) await locker.execute('ROLLBACK');
      locker.release();
    }
  });
});
