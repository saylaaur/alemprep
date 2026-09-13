import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness, type TestActor } from './helpers';

type SeededLearning = {
  questionId: string;
  versionId: string;
  sessionId: string;
};

async function seedLearning(db: DbHarness, actor: TestActor): Promise<SeededLearning> {
  const suffix = crypto.randomUUID();
  const subjectId = await db.scalar<string>(
    `INSERT INTO public.subjects (slug, name_ru, name_kk, is_active)
     VALUES ($1, 'L01 subject', 'L01 пәні', true)
     RETURNING id`,
    [`l01-${suffix}`]
  );
  const topicId = await db.scalar<string>(
    `INSERT INTO public.topics (subject_id, slug, name_ru, name_kk)
     VALUES ($1, $2, 'L01 topic', 'L01 тақырыбы')
     RETURNING id`,
    [subjectId, `l01-${suffix}`]
  );
  const questionId = await db.scalar<string>(
    `INSERT INTO public.questions (topic_id, language, type, body, is_published)
     VALUES ($1, 'kk', 'single', $2::jsonb, true)
     RETURNING id`,
    [topicId, JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }], correct: 'A' })]
  );
  const versionId = await db.scalar<string>(
    `INSERT INTO public.question_versions
       (question_id, family_id, revision, locale, type, public_body, grading_body, explanation, context_snapshot, content_hash)
     VALUES ($1, gen_random_uuid(), 1, 'kk', 'single', $2::jsonb, $3::jsonb, $4::jsonb, NULL, $5)
     RETURNING id`,
    [
      questionId,
      JSON.stringify({ stem: 'public', options: [{ id: 'A', content: 'A' }] }),
      JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }], correct: 'A' }),
      JSON.stringify({ blocks: [{ type: 'text', value: 'private explanation' }] }),
      `sha256:${suffix}`,
    ]
  );
  const sessionId = await db.scalar<string>(
    `INSERT INTO public.sessions (user_id, topic_id, mode, total_questions)
     VALUES ($1, $2, 'practice', 1)
     RETURNING id`,
    [actor.id, topicId]
  );

  return { questionId, versionId, sessionId };
}

describe('L01 learning integrity schema', () => {
  let db: DbHarness | undefined;

  afterEach(async () => {
    await db?.close();
    db = undefined;
  });

  it('keeps immutable versions outside browser JWT access', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-version-browser');
    const seeded = await seedLearning(db, actor);

    const read = await db.rest(actor, `/question_versions?id=eq.${seeded.versionId}&select=id`);
    const write = await db.rest(actor, `/question_versions?id=eq.${seeded.versionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ public_body: { stem: 'tampered' } }),
    });
    const stem = await db.scalar<string>(
      `SELECT public_body->>'stem' AS stem FROM public.question_versions WHERE id = $1`,
      [seeded.versionId]
    );

    expect(read.status).toBeGreaterThanOrEqual(400);
    expect(write.status).toBeGreaterThanOrEqual(400);
    expect(stem).toBe('public');
  });

  it('rejects a direct server-side mutation of an immutable version', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-version-immutable');
    const seeded = await seedLearning(db, actor);

    await expect(db.scalar(
      `UPDATE public.question_versions SET public_body = '{"stem":"tampered"}'::jsonb WHERE id = $1`,
      [seeded.versionId]
    )).rejects.toThrow();
  });

  it('marks legacy sessions and attempts untrusted by default', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-legacy');
    const seeded = await seedLearning(db, actor);
    const attemptId = await db.scalar<string>(
      `INSERT INTO public.attempts (user_id, question_id, session_id, given_answer, is_correct)
       VALUES ($1, $2, $3, $4::jsonb, false)
       RETURNING id`,
      [actor.id, seeded.questionId, seeded.sessionId, JSON.stringify('B')]
    );

    const sessionIntegrity = await db.scalar<number>(
      'SELECT integrity_version FROM public.sessions WHERE id = $1', [seeded.sessionId]
    );
    const attemptIntegrity = await db.scalar<number>(
      'SELECT integrity_version FROM public.attempts WHERE id = $1', [attemptId]
    );

    expect(sessionIntegrity).toBe(0);
    expect(attemptIntegrity).toBe(0);
  });

  it('rejects duplicate items and prevents deleting a question with learning history', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-history');
    const seeded = await seedLearning(db, actor);
    await db.scalar<string>(
      `INSERT INTO public.session_items (session_id, question_version_id, position)
       VALUES ($1, $2, 0)`,
      [seeded.sessionId, seeded.versionId]
    );

    await expect(db.scalar(
      `INSERT INTO public.session_items (session_id, question_version_id, position)
       VALUES ($1, $2, 1)`,
      [seeded.sessionId, seeded.versionId]
    )).rejects.toThrow();
    await expect(db.scalar('DELETE FROM public.questions WHERE id = $1', [seeded.questionId]))
      .rejects.toThrow();

    // Synthetic auth cleanup cascades through sessions, so remove the fixture's
    // deliberately restrictive history edge after asserting its behavior.
    await db.scalar('DELETE FROM public.session_items WHERE session_id = $1', [seeded.sessionId]);
  });

  it('enables RLS and removes browser-role table grants from internal facts', async () => {
    db = await createDbHarness();
    const protectedTables = [
      'question_versions',
      'question_publications',
      'session_items',
      'operation_receipts',
      'reward_ledger',
      'audit_events',
    ];

    for (const table of protectedTables) {
      const rls = await db.scalar<boolean>(
        `SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || $1)::regclass`,
        [table]
      );
      const browserCanRead = await db.scalar<boolean>(
        `SELECT has_table_privilege('authenticated', 'public.' || $1, 'SELECT')`,
        [table]
      );
      expect(rls).toBe(true);
      expect(browserCanRead).toBe(false);
    }
  });

  it('accepts only audit metadata that fits the explicit safe allowlist', async () => {
    db = await createDbHarness();
    const actor = await db.actor('learning-audit-metadata');

    const eventId = await db.scalar<string>(
      `INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, metadata)
       VALUES ($1, 'user', 'learning.submitted', 'session', $2::jsonb)
       RETURNING id`,
      [actor.id, JSON.stringify({ result: 'accepted', reason_code: 'normal' })]
    );
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);

    await expect(db.scalar(
      `INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, metadata)
       VALUES ($1, 'user', 'learning.submitted', 'session', $2::jsonb)`,
      [actor.id, JSON.stringify({ answer: 'A' })]
    )).rejects.toThrow();
    await expect(db.scalar(
      `INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, metadata)
       VALUES ($1, 'user', 'learning.submitted', 'session', $2::jsonb)`,
      [actor.id, JSON.stringify({ payload: { cookie: 'private' } })]
    )).rejects.toThrow();
    await expect(db.scalar(
      `INSERT INTO public.audit_events (actor_id, actor_kind, event_type, entity_type, metadata)
       VALUES ($1, 'user', 'learning.submitted', 'session', $2::jsonb)`,
      [actor.id, JSON.stringify({ reason_code: 'cookie-token-abc123' })]
    )).rejects.toThrow();
  });
});
