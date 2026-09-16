import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createDbHarness, type DbHarness } from './helpers';

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
     VALUES ($1, 'Validation subject', 'Валидация пәні', true)
     RETURNING id`,
    [`validation-${suffix}`]
  );
  const topicId = await db.scalar<string>(
    `INSERT INTO public.topics (subject_id, slug, name_ru, name_kk)
     VALUES ($1, $2, 'Validation topic', 'Валидация тақырыбы')
     RETURNING id`,
    [subjectId, `validation-${suffix}`]
  );
  const questionId = await db.scalar<string>(
    `INSERT INTO public.questions (topic_id, language, type, body, is_published)
     VALUES ($1, 'kk', 'single', $2::jsonb, true)
     RETURNING id`,
    [topicId, JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }], correct: 'A' })]
  );
  const versionId = await db.scalar<string>(
    `INSERT INTO public.question_versions
       (question_id, family_id, revision, locale, type, public_body, grading_body, content_hash)
     VALUES ($1, gen_random_uuid(), 1, 'kk', 'single', $2::jsonb, $3::jsonb, $4)
     RETURNING id`,
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

function startPlan(seeded: SeededLearning, scope: { topicId?: string; subjectId?: string } = {}) {
  return {
    sessions: [{
      mode: 'practice',
      topicId: scope.topicId ?? seeded.topicId,
      subjectId: scope.subjectId ?? seeded.subjectId,
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

async function startIssuedSession(db: DbHarness, actorId: string, seeded: SeededLearning): Promise<IssuedSession> {
  const response = await db.rpc('service', 'start_learning_v1', {
    actor_id: actorId,
    operation_id: crypto.randomUUID(),
    payload_hash: `start:${crypto.randomUUID()}`,
    plan: startPlan(seeded),
  });
  expect(response.status, JSON.stringify(response.data)).toBe(200);
  return (response.data as { sessions: IssuedSession[] }).sessions[0]!;
}

describe('L02a-R learning RPC validation', () => {
  let db: DbHarness | undefined;
  let actorId: string | undefined;

  afterEach(async () => {
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

  it('rejects an unknown stored scoring version before attempts or XP are written', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-validation-scoring');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const session = await startIssuedSession(db, actor.id, seeded);
    await db.execute(`UPDATE public.sessions SET scoring_version = 'future-v99' WHERE id = $1`, [session.id]);

    const response = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:unknown-scoring',
      session_id: session.id,
      scoring_version: 'future-v99',
      graded_items: submittedItem(session, seeded),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id])).toBe(0);
    expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(0);
  });

  it('rejects a session whose issued item positions have a gap before attempts are written', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-validation-position');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const session = await startIssuedSession(db, actor.id, seeded);
    await db.execute('UPDATE public.session_items SET position = 7 WHERE session_id = $1', [session.id]);

    const response = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:gapped-position',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: submittedItem(session, seeded),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id])).toBe(0);
  });

  it('rejects empty and mismatched topic or subject scope instead of silently removing it', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-validation-empty-scope');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const unrelated = await seedApprovedVersion(db);
    const cases = [
      { name: 'empty-topic', scope: { topicId: '', subjectId: seeded.subjectId }, message: 'invalid-input' },
      { name: 'empty-subject', scope: { topicId: seeded.topicId, subjectId: '' }, message: 'invalid-input' },
      { name: 'foreign-topic', scope: { topicId: unrelated.topicId, subjectId: seeded.subjectId }, message: 'content-unavailable' },
      { name: 'foreign-subject', scope: { topicId: seeded.topicId, subjectId: unrelated.subjectId }, message: 'content-unavailable' },
    ];

    for (const testCase of cases) {
      const response = await db.rpc('service', 'start_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: `start:scope:${testCase.name}`,
        plan: startPlan(seeded, testCase.scope),
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data).toMatchObject({ message: testCase.message });
    }
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id])).toBe(0);
  });

  it('returns already-submitted after quarantine for a new operation without writing new facts', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-validation-submitted');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const session = await startIssuedSession(db, actor.id, seeded);
    const first = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:first',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: submittedItem(session, seeded),
    });
    expect(first.status, JSON.stringify(first.data)).toBe(200);
    await db.execute(
      `UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1`,
      [seeded.versionId]
    );

    const response = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:after-quarantine',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: submittedItem(session, seeded),
    });

    expect(response.status, JSON.stringify(response.data)).toBe(200);
    expect(response.data).toMatchObject({ error: 'already-submitted' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id])).toBe(1);
    expect(await db.scalar<number>('SELECT xp FROM public.profiles WHERE id = $1', [actor.id])).toBe(10);
  });

  it('replays the original start receipt after its issued version is quarantined', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-validation-start-replay');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const operationId = crypto.randomUUID();
    const args = {
      actor_id: actor.id,
      operation_id: operationId,
      payload_hash: 'start:replay-after-quarantine',
      plan: startPlan(seeded),
    };
    const started = await db.rpc('service', 'start_learning_v1', args);
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    await db.execute(
      `UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1`,
      [seeded.versionId]
    );

    const replay = await db.rpc('service', 'start_learning_v1', args);

    expect(replay.status, JSON.stringify(replay.data)).toBe(200);
    expect(replay.data).toEqual(started.data);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id])).toBe(1);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.audit_events
       WHERE actor_id = $1 AND event_type = 'learning.started'`,
      [actor.id]
    )).toBe(1);
  });

  it('accepts only one of two different concurrent submit operations for the same session', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-validation-different-ops');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const session = await startIssuedSession(db, actor.id, seeded);
    const commonArgs = {
      actor_id: actor.id,
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: submittedItem(session, seeded),
    };

    const [first, second] = await Promise.all([
      db.rpc('service', 'commit_learning_v1', {
        ...commonArgs,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:different-operation:first',
      }),
      db.rpc('service', 'commit_learning_v1', {
        ...commonArgs,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:different-operation:second',
      }),
    ]);

    expect([first.status, second.status], JSON.stringify([first.data, second.data])).toEqual([200, 200]);
    expect([first.data, second.data].filter((result) =>
      typeof result === 'object' && result !== null && 'error' in result
    )).toEqual([{ error: 'already-submitted' }]);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id])).toBe(1);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.audit_events
       WHERE entity_id = $1 AND event_type = 'learning.submitted'`, [session.id]
    )).toBe(1);
  });

  it('rejects malformed submitted values before attempts, rewards, or receipts are written', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-validation-malformed-items');
    actorId = actor.id;
    const seeded = await seedApprovedVersion(db);
    const session = await startIssuedSession(db, actor.id, seeded);
    const valid = submittedItem(session, seeded)[0]!;
    const malformedItems = [
      [{ ...valid, points: 0.5 }],
      [{ ...valid, points: -1 }],
      [{ ...valid, timeSpentMs: 7_200_001 }],
      [valid, valid],
    ];

    for (const gradedItems of malformedItems) {
      const response = await db.rpc('service', 'commit_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: `submit:malformed:${crypto.randomUUID()}`,
        session_id: session.id,
        scoring_version: 'ent-v1',
        graded_items: gradedItems,
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data).toMatchObject({ message: 'invalid-input' });
    }
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id = $1', [session.id])).toBe(0);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.reward_ledger WHERE user_id = $1', [actor.id])).toBe(0);
    expect(await db.scalar<number>(
      `SELECT count(*)::int FROM public.operation_receipts
       WHERE actor_id = $1 AND kind = 'learning.submit'`, [actor.id]
    )).toBe(0);

    const acceptedAtDurationLimit = await db.rpc('service', 'commit_learning_v1', {
      actor_id: actor.id,
      operation_id: crypto.randomUUID(),
      payload_hash: 'submit:duration-limit',
      session_id: session.id,
      scoring_version: 'ent-v1',
      graded_items: [{ ...valid, timeSpentMs: 7_200_000 }],
    });
    expect(acceptedAtDurationLimit.status, JSON.stringify(acceptedAtDurationLimit.data)).toBe(200);
    expect(acceptedAtDurationLimit.data).toMatchObject({ score: 1, maxScore: 1 });
  });
});
