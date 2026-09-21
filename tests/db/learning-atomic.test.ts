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
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.audit_events
       WHERE entity_id = $1 AND event_type = 'learning.started'`, [sessionId]
    )).toBe(1);
    const changedPayload = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: operationId,
      payload_hash: 'start:changed-payload',
      plan: startPlan(seeded),
    });
    expect(changedPayload.status, JSON.stringify(changedPayload.data)).toBe(200);
    expect(changedPayload.data).toMatchObject({ error: 'operation-conflict' });
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.audit_events
       WHERE entity_id = $1 AND event_type = 'learning.started'`, [sessionId]
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
    const beforeConflict = await learningFacts(db, actor.id);
    const changedPayload = await db.rpc('service', 'commit_learning_v1', {
      ...commitArgs,
      payload_hash: 'submit:concurrency:changed-payload',
      graded_items: [{ ...commitArgs.graded_items[0], answer: 'B', points: 0 }],
    });
    expect(changedPayload.status, JSON.stringify(changedPayload.data)).toBe(200);
    expect(changedPayload.data).toMatchObject({ error: 'operation-conflict' });
    await expectUnchangedLearning(db, actor.id, beforeConflict);
    await db.execute(`UPDATE public.sessions SET expires_at = now() - interval '1 second' WHERE id = $1`, [session.id]);
    const postExpiryReplay = await db.rpc('service', 'commit_learning_v1', commitArgs);
    expect(postExpiryReplay.status, JSON.stringify(postExpiryReplay.data)).toBe(200);
    expect(postExpiryReplay.data).toEqual(replies[0]!.data);
    const secondOperation = await db.rpc('service', 'commit_learning_v1', {
      ...commitArgs,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:concurrency:second-operation',
    });
    expect(secondOperation.status, JSON.stringify(secondOperation.data)).toBe(200);
    expect(secondOperation.data).toMatchObject({ error: 'already-submitted' });
    expect(await db.scalar<number>(
      'SELECT count(*)::int FROM public.attempts WHERE session_id = $1 AND integrity_version = 1', [session.id]
    )).toBe(1);
    await db.execute(
      `UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1`,
      [seeded.versionId]
    );
    const beforeReplay = await learningFacts(db, actor.id);
    const quarantinedReplay = await db.rpc('service', 'commit_learning_v1', commitArgs);
    expect(quarantinedReplay.status, JSON.stringify(quarantinedReplay.data)).toBe(200);
    expect(quarantinedReplay.data).toEqual(replies[0]!.data);
    await expectUnchangedLearning(db, actor.id, beforeReplay);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.audit_events
       WHERE entity_id = $1 AND event_type = 'learning.submitted'`, [session.id]
    )).toBe(1);
  });

  it('creates both mock_exam blocks with one receipt when their expiry is shared', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-mock-pair');
    actorIds.push(actor.id);
    const first = await seedApprovedVersion(db);
    const second = await seedApprovedVersion(db);
    const firstSession = { ...startPlan(first).sessions[0]!, mode: 'mock_exam' };
    const secondSession = {
      ...startPlan(second).sessions[0]!,
      mode: 'mock_exam',
      expiresAt: firstSession.expiresAt,
    };

    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:mock-pair',
      plan: { sessions: [firstSession, secondSession] },
    });

    expect(started.status, JSON.stringify(started.data)).toBe(200);
    expect(started.data).toMatchObject({
      sessions: [
        { mode: 'mock_exam', itemIds: [expect.any(String)] },
        { mode: 'mock_exam', itemIds: [expect.any(String)] },
      ],
    });
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.operation_receipts
       WHERE actor_id = $1 AND kind = 'learning.start'`, [actor.id]
    )).toBe(1);
    const issued = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions;
    const [firstIssued, secondIssued] = issued;
    const firstCommit = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:mock-pair:first',
      session_id: firstIssued!.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: firstIssued!.itemIds[0], questionVersionId: first.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });
    const secondCommit = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:mock-pair:second',
      session_id: secondIssued!.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: secondIssued!.itemIds[0], questionVersionId: second.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });
    expect(firstCommit.status, JSON.stringify(firstCommit.data)).toBe(200);
    expect(secondCommit.status, JSON.stringify(secondCommit.data)).toBe(200);
    expect(firstCommit.data).toMatchObject({ sessionId: firstIssued!.id, score: 1, maxScore: 1 });
    expect(secondCommit.data).toMatchObject({ sessionId: secondIssued!.id, score: 1, maxScore: 1 });
    expect(firstIssued!.id).not.toBe(secondIssued!.id);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.operation_receipts WHERE actor_id = $1 AND kind = 'learning.submit'`, [actor.id]
    )).toBe(2);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.reward_ledger
       WHERE user_id = $1 AND reward_key LIKE 'exam-bonus:%'`, [actor.id]
    )).toBe(2);
  });

  it('keeps simultaneous learner sessions isolated and accepts each owner-issued item', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-multiple-sessions-a');
    const secondActor = await db.actor('learning-atomic-multiple-sessions-b');
    actorIds.push(actor.id, secondActor.id);
    const first = await seedApprovedVersion(db);
    const second = await seedApprovedVersion(db);
    const third = await seedApprovedVersion(db);

    const firstStarted = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:multiple-sessions:first',
      plan: startPlan(first),
    });
    const secondStarted = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:multiple-sessions:second',
      plan: startPlan(second),
    });
    expect(firstStarted.status, JSON.stringify(firstStarted.data)).toBe(200);
    expect(secondStarted.status, JSON.stringify(secondStarted.data)).toBe(200);
    const firstSession = (firstStarted.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
    const secondSession = (secondStarted.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
    const thirdStarted = await db.rpc('service', 'start_learning_v1', {
      actor_id: secondActor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:multiple-sessions:third',
      plan: startPlan(third),
    });
    expect(thirdStarted.status, JSON.stringify(thirdStarted.data)).toBe(200);
    const thirdSession = (thirdStarted.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;

    const beforeSubstitution = await learningFacts(db, actor.id);
    const beforeOtherLearner = await learningFacts(db, secondActor.id);
    const substituted = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:multiple-sessions:substitute-a2-into-a1',
      session_id: firstSession.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: secondSession.itemIds[0], questionVersionId: second.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });
    expect(substituted.status).toBeGreaterThanOrEqual(400);
    expect(substituted.data).toMatchObject({ message: 'invalid-input' });
    await expectUnchangedLearning(db, actor.id, beforeSubstitution);
    await expectUnchangedLearning(db, secondActor.id, beforeOtherLearner);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [firstSession.id]))
      .toBe(0);

    const firstCommitted = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:multiple-sessions:first',
      session_id: firstSession.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: firstSession.itemIds[0], questionVersionId: first.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });

    expect(firstCommitted.status, JSON.stringify(firstCommitted.data)).toBe(200);
    const secondCommitted = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:multiple-sessions:second',
      session_id: secondSession.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: secondSession.itemIds[0], questionVersionId: second.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });
    expect(secondCommitted.status, JSON.stringify(secondCommitted.data)).toBe(200);
    const thirdCommitted = await db.rpc('service', 'commit_learning_v1', {
      actor_id: secondActor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:multiple-sessions:third',
      session_id: thirdSession.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: thirdSession.itemIds[0], questionVersionId: third.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });
    expect(thirdCommitted.status, JSON.stringify(thirdCommitted.data)).toBe(200);
    expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [firstSession.id]))
      .toBe('submitted');
    expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [secondSession.id]))
      .toBe('submitted');
    expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [thirdSession.id]))
      .toBe('submitted');
  });

  it('rejects a submitted item that omits its duration before creating facts', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-missing-duration');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:missing-duration',
      plan: startPlan(seeded),
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const session = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;

    const nullItems = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:null-items',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: null,
    });
    expect(nullItems.status).toBeGreaterThanOrEqual(400);
    expect(nullItems.data).toMatchObject({ message: 'invalid-input' });

    const rejected = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:missing-duration',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: session.itemIds[0], questionVersionId: seeded.versionId,
        answer: 'A', points: 1, maxPoints: 1,
      }],
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id]))
      .toBe(0);
    expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [session.id]))
      .toBe('active');
  });

  it('rejects a submitted item with an unexpected field before creating facts', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-extra-field');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:extra-field',
      plan: startPlan(seeded),
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const session = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;

    const rejected = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:extra-field',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: session.itemIds[0], questionVersionId: seeded.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000, isCorrect: true,
      }],
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id]))
      .toBe(0);
  });

  it('rejects a submit when the stored manifest no longer matches the issued versions', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-tampered-manifest');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:tampered-manifest',
      plan: startPlan(seeded),
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const session = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
    await db.execute(`UPDATE public.sessions SET manifest_hash = 'sha256:tampered' WHERE id = $1`, [session.id]);

    const rejected = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:tampered-manifest',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: session.itemIds[0], questionVersionId: seeded.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id]))
      .toBe(0);
  });

  it('rejects a submit after an issued version is quarantined', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-quarantined-version');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:quarantined-version',
      plan: startPlan(seeded),
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const session = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
    await db.execute(
      `UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1`,
      [seeded.versionId]
    );

    const rejected = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:quarantined-version',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: session.itemIds[0], questionVersionId: seeded.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'content-unavailable' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id]))
      .toBe(0);
  });

  it('does not expose trusted learning RPC to anonymous or authenticated browser roles', async () => {
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
    const anonymousStart = await db.rpc('anon', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'anonymous:must-not-call',
      plan: startPlan(seeded),
    });
    const anonymousSubmit = await db.rpc('anon', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'anonymous:must-not-submit',
      session_id: '11111111-1111-4111-8111-111111111111',
      scoring_version: 'ent-v1',
      graded_items: [],
    });
    expect(anonymousStart.status).toBeGreaterThanOrEqual(400);
    expect(anonymousSubmit.status).toBeGreaterThanOrEqual(400);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id])).toBe(0);
  });

  it('rejects a start plan with JSON null, a missing locale, or a mismatched content locale', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-start-locale');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);

    const nullPlan = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:null-plan',
      plan: null,
    });
    const missingLocalePlan = startPlan(seeded);
    delete (missingLocalePlan.sessions[0] as Record<string, unknown>).locale;
    const missingLocale = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:missing-locale',
      plan: missingLocalePlan,
    });
    const wrongLocalePlan = startPlan(seeded);
    wrongLocalePlan.sessions[0]!.locale = 'ru';
    const wrongLocale = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:wrong-locale',
      plan: wrongLocalePlan,
    });

    for (const rejected of [nullPlan, missingLocale]) {
      expect(rejected.status).toBeGreaterThanOrEqual(400);
      expect(rejected.data).toMatchObject({ message: 'invalid-input' });
    }
    expect(wrongLocale.status).toBeGreaterThanOrEqual(400);
    expect(wrongLocale.data).toMatchObject({ message: 'content-unavailable' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id]))
      .toBe(0);
  });

  it('rejects an issued version outside the plan topic or subject', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-catalog-membership');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const unrelated = await seedApprovedVersion(db);
    const plan = startPlan(seeded);
    plan.sessions[0]!.topicId = unrelated.topicId;
    plan.sessions[0]!.subjectId = unrelated.subjectId;

    const rejected = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:catalog-membership',
      plan,
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'content-unavailable' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id]))
      .toBe(0);
  });

  it('rejects an invalid session-mode shape before issuing any session', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-mode-shape');
    actorIds.push(actor.id);
    const first = await seedApprovedVersion(db);
    const second = await seedApprovedVersion(db);
    const plan = {
      sessions: [
        { ...startPlan(first).sessions[0], mode: 'mock_exam' },
        { ...startPlan(second).sessions[0], mode: 'practice' },
      ],
    };

    const rejected = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:mixed-modes',
      plan,
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id]))
      .toBe(0);
  });

  it('rejects a submit when the stored question denominator no longer matches issued items', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-tampered-total');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const started = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:tampered-denominator',
      plan: startPlan(seeded),
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const session = (started.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
    await db.execute('UPDATE public.sessions SET question_ids = NULL WHERE id = $1', [session.id]);

    const rejected = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:tampered-denominator',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: [{
        itemId: session.itemIds[0], questionVersionId: seeded.versionId,
        answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1000,
      }],
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id]))
      .toBe(0);
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

  it('rejects a start plan that omits its mode before creating sessions', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-atomic-missing-mode');
    actorIds.push(actor.id);
    const seeded = await seedApprovedVersion(db);
    const plan = startPlan(seeded);
    delete (plan.sessions[0] as Record<string, unknown>).mode;

    const rejected = await db.rpc('service', 'start_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'start:missing-mode',
      plan,
    });

    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id]))
      .toBe(0);
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
    const failingOperationId = crypto.randomUUID();
    await db.execute(`
      CREATE OR REPLACE FUNCTION public.l02_test_abort_audit_event()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.operation_id = '${failingOperationId}'::uuid THEN
          RAISE EXCEPTION 'test audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER l02_test_abort_audit_event
      BEFORE INSERT ON public.audit_events
      FOR EACH ROW EXECUTE FUNCTION public.l02_test_abort_audit_event();
    `);

    try {
      const unaffectedStart = await db.rpc('service', 'start_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'start:rollback-unaffected',
        plan: startPlan(seeded),
      });
      expect(unaffectedStart.status, JSON.stringify(unaffectedStart.data)).toBe(200);
      const failed = await db.rpc('service', 'commit_learning_v1', {
        actor_id: actor.id,
        operation_id: failingOperationId,
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
