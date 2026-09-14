import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createDbHarness, type DbHarness } from './helpers';

type SeededLearning = {
  questionId: string;
  versionId: string;
  topicId: string;
  manifestHash: string;
};

async function seedApprovedVersion(db: DbHarness): Promise<SeededLearning> {
  const suffix = crypto.randomUUID();
  const subjectId = await db.scalar<string>(
    `INSERT INTO public.subjects (slug, name_ru, name_kk, is_active)
     VALUES ($1, 'L02 subject', 'L02 пәні', true)
     RETURNING id`,
    [`l02-${suffix}`]
  );
  const topicId = await db.scalar<string>(
    `INSERT INTO public.topics (subject_id, slug, name_ru, name_kk)
     VALUES ($1, $2, 'L02 topic', 'L02 тақырыбы')
     RETURNING id`,
    [subjectId, `l02-${suffix}`]
  );
  const questionId = await db.scalar<string>(
    `INSERT INTO public.questions (topic_id, language, type, body, is_published)
     VALUES ($1, 'kk', 'single', $2::jsonb, true)
     RETURNING id`,
    [topicId, JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }, { id: 'B', content: 'B' }], correct: 'A' })]
  );
  const versionId = await db.scalar<string>(
    `INSERT INTO public.question_versions
       (question_id, family_id, revision, locale, type, public_body, grading_body, content_hash)
     VALUES ($1, gen_random_uuid(), 1, 'kk', 'single', $2::jsonb, $3::jsonb, $4)
     RETURNING id`,
    [
      questionId,
      JSON.stringify({ stem: 'public', options: [{ id: 'A', content: 'A' }, { id: 'B', content: 'B' }] }),
      JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }, { id: 'B', content: 'B' }], correct: 'A' }),
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
    manifestHash: `sha256:${createHash('sha256').update(`${versionId}:sha256:${suffix}`).digest('hex')}`,
  };
}

function startPlan(seeded: SeededLearning) {
  return {
    sessions: [{
      mode: 'practice',
      topicId: seeded.topicId,
      subjectId: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scoringVersion: 'ent-v1',
      manifestHash: seeded.manifestHash,
      items: [{ versionId: seeded.versionId }],
    }],
  };
}

describe('L02 atomic learning RPC', () => {
  let db: DbHarness | undefined;
  let actorIds: string[] = [];

  afterEach(async () => {
    for (const actorId of actorIds) {
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
    actorIds = [];
  });

  it('creates the issued session and its receipt in one service-only operation', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-start');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const operationId = crypto.randomUUID();

    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: operationId,
      payload_hash: 'start:fixture',
      plan: startPlan(seeded),
    });

    expect(started.status, JSON.stringify(started.data)).toBe(200);
    expect(started.data).toMatchObject({ sessions: [{ mode: 'practice', itemIds: [expect.any(String)] }] });
    const sessionId = (started.data as { sessions: { id: string }[] }).sessions[0]?.id;
    expect(await db.scalar<number>(
      'SELECT count(*)::int FROM public.session_items WHERE session_id = $1', [sessionId]
    )).toBe(1);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.operation_receipts
       WHERE actor_id = $1 AND operation_id = $2 AND kind = 'learning.start'`,
      [actor.id, operationId]
    )).toBe(1);
  });

  it('accepts concurrent retries once and creates one trusted learning fact', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-concurrency');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:concurrency',
      plan: startPlan(seeded),
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const session = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
    const commitArgs = {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:concurrency',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: session.itemIds[0],
        questionVersionId: seeded.versionId,
        answer: 'A',
        points: 1,
        maxPoints: 1,
        timeSpentMs: 1000,
      }],
    };

    const replies = await Promise.all(Array.from({ length: 20 }, () =>
      db!.rpc('service', 'commit_learning_v1', commitArgs)
    ));

    expect(replies.map((reply) => reply.status), JSON.stringify(replies[0]?.data)).toEqual(Array.from({ length: 20 }, () => 200));
    expect(await db.scalar<number>(
      'SELECT count(*)::int FROM public.attempts WHERE session_id = $1 AND integrity_version = 1', [session.id]
    )).toBe(1);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.audit_events
       WHERE entity_id = $1 AND event_type = 'learning.submitted'`, [session.id]
    )).toBe(1);
    expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(10);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.operation_receipts
       WHERE actor_id = $1 AND kind = 'learning.submit'`, [actor.id]
    )).toBe(1);
  });

  it('does not expose trusted learning RPC to an authenticated browser role', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-browser-role');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);

    const response = await db.rpc(actor, 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'browser:must-not-call',
      plan: startPlan(seeded),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    const submit = await db.rpc(actor, 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'browser:must-not-submit',
      session_id: '11111111-1111-4111-8111-111111111111',
      scoring_version: 'ent-v1',
      graded_items: [],
    });
    expect(submit.status).toBeGreaterThanOrEqual(400);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id])).toBe(0);
  });

  it('refuses a plan whose manifest does not describe its issued versions', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-manifest');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const plan = startPlan(seeded);
    plan.sessions[0]!.manifestHash = 'sha256:wrong';

    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:wrong-manifest',
      plan,
    });

    expect(started.status).toBeGreaterThanOrEqual(400);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id])).toBe(0);
  });

  it('rolls back attempts, rewards and receipts when audit insertion fails', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-rollback');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:rollback',
      plan: startPlan(seeded),
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const session = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
    await db.execute(`
      CREATE OR REPLACE FUNCTION public.l02_test_abort_audit_event()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'test audit failure';
      END;
      $$;
      CREATE TRIGGER l02_test_abort_audit_event
      BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION public.l02_test_abort_audit_event();
    `);

    try {
      const failed = await db.rpc('service', 'commit_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:rollback',
        session_id: session.id,
        scoring_version: 'ent-v1',
        graded_items: [{
          itemId: session.itemIds[0], questionVersionId: seeded.versionId,
          answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
        }],
      });
      expect(failed.status).toBeGreaterThanOrEqual(400);
      expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id])).toBe(0);
      expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(0);
      expect(await db.scalar<number>(
        `SELECT count(*)::int FROM public.operation_receipts
         WHERE actor_id = $1 AND kind = 'learning.submit'`, [actor.id]
      )).toBe(0);
      expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [session.id])).toBe('active');
    } finally {
      await db.execute('DROP TRIGGER IF EXISTS l02_test_abort_audit_event ON public.audit_events');
      await db.execute('DROP FUNCTION IF EXISTS public.l02_test_abort_audit_event()');
    }
  });

  it('rejects a submit from a different actor without changing the issued session', async () => {
    db = await createDbHarness();
    const owner = await db.actor('learning-atomic-owner');
    const other = await db.actor('learning-atomic-other');
    actorIds.push(owner.id, other.id);
    const seeded = await seedApprovedVersion(db);
    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: owner.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:owner',
      plan: startPlan(seeded),
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const session = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;

    const denied = await db.rpc('service', 'commit_learning_v1', {
      actor_id: other.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:other',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: session.itemIds[0], questionVersionId: seeded.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });

    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [session.id])).toBe('active');
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id])).toBe(0);
  });
});
