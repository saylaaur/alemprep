import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness, type TestActor } from './helpers';
import { createLearningStartService } from '@/lib/learning/start';
import { createLearningStateService } from '@/lib/learning/state';
import { createLearningSubmitService } from '@/lib/learning/submit';
import { createLearningReviewService } from '@/lib/learning/review';
import {
  createSupabaseLearningContentClient,
  createSupabaseLearningReplayClient,
  createSupabaseLearningReviewClient,
  createSupabaseLearningStateClient,
  loadStartReplay,
} from '@/lib/learning/repository';

type Locale = 'ru' | 'kk';

type Seeded = {
  topicSlug: string;
};

async function seedApprovedPractice(db: DbHarness, locale: Locale): Promise<Seeded> {
  const suffix = crypto.randomUUID();
  const subjectId = await db.scalar<string>(
    `INSERT INTO public.subjects (slug, name_ru, name_kk, is_active)
     VALUES ($1, 'L02 service subject', 'L02 service пәні', true)
     RETURNING id`,
    [`l02-service-${suffix}`],
  );
  const topicSlug = `l02-service-topic-${suffix}`;
  const topicId = await db.scalar<string>(
    `INSERT INTO public.topics (subject_id, slug, name_ru, name_kk)
     VALUES ($1, $2, 'L02 service topic', 'L02 service тақырыбы')
     RETURNING id`,
    [subjectId, topicSlug],
  );
  const questionId = await db.scalar<string>(
    `INSERT INTO public.questions (topic_id, language, type, body, is_published)
     VALUES ($1, $2, 'single', $3::jsonb, true)
     RETURNING id`,
    [topicId, locale, JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }, { id: 'B', content: 'B' }], correct: 'A' })],
  );
  const versionId = await db.scalar<string>(
    `INSERT INTO public.question_versions
       (question_id, family_id, revision, locale, type, public_body, grading_body, content_hash)
     VALUES ($1, gen_random_uuid(), 1, $2, 'single', $3::jsonb, $4::jsonb, $5)
     RETURNING id`,
    [
      questionId,
      locale,
      JSON.stringify({ stem: 'public', options: [{ id: 'A', content: 'A' }, { id: 'B', content: 'B' }] }),
      JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }, { id: 'B', content: 'B' }], correct: 'A' }),
      `sha256:${suffix}`,
    ],
  );
  await db.execute(`INSERT INTO public.question_publications (question_version_id, status) VALUES ($1, 'approved')`, [versionId]);
  return { topicSlug };
}

describe('L02c service integration', () => {
  let db: DbHarness | undefined;
  let actors: TestActor[] = [];

  afterEach(async () => {
    for (const actor of actors) {
      await db?.execute('DELETE FROM public.attempts WHERE user_id = $1', [actor.id]);
      await db?.execute('DELETE FROM public.session_items WHERE session_id IN (SELECT id FROM public.sessions WHERE user_id = $1)', [actor.id]);
      await db?.execute('DELETE FROM public.reward_ledger WHERE user_id = $1', [actor.id]);
      await db?.execute('DELETE FROM public.sessions WHERE user_id = $1', [actor.id]);
      await db?.execute('DELETE FROM public.operation_receipts WHERE actor_id = $1', [actor.id]);
    }
    await db?.close();
    db = undefined;
    actors = [];
  });

  it('starts once, denies active replay after quarantine, and hides foreign state', async () => {
    db = await createDbHarness();
    const owner = await db.actor('l02c-owner');
    const other = await db.actor('l02c-other');
    actors = [owner, other];
    const seeded = await seedApprovedPractice(db, 'kk');
    const admin = db.adminClient();
    const replay = createSupabaseLearningReplayClient(admin);
    const start = createLearningStartService({
      actorId: async () => owner.id,
      content: createSupabaseLearningContentClient(admin),
      rpc: admin,
      now: () => new Date(),
      findReplay: ({ actorId, operationId, payloadHash }) => loadStartReplay(replay, actorId, operationId, payloadHash),
    });
    const operationId = crypto.randomUUID();
    const input = { operationId, locale: 'kk' as const, mode: 'practice' as const, topicSlug: seeded.topicSlug };

    const [first, concurrent] = await Promise.all([start.startLearning(input), start.startLearning(input)]);
    expect(concurrent).toEqual(first);
    expect(first).toMatchObject({ ok: true, value: { sessions: [{ items: [{ question: { body: { stem: 'public' } } }] }] } });
    expect(JSON.stringify(first)).not.toContain('correct');
    if (!first.ok) throw new Error('start did not issue a session');
    const sessionId = first.value.sessions[0]?.id;
    expect(sessionId).toEqual(expect.any(String));

    await db.execute(
      `UPDATE public.question_publications SET status = 'quarantined'
       WHERE question_version_id = (SELECT question_version_id FROM public.session_items WHERE session_id = $1 LIMIT 1)`,
      [sessionId],
    );
    const replayed = await start.startLearning(input);
    expect(replayed).toMatchObject({ ok: false, error: 'temporarily-unavailable' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id=$1', [owner.id])).toBe(1);

    const ownerState = createLearningStateService({
      actorId: async () => owner.id,
      state: createSupabaseLearningStateClient(admin, 'reload'),
    });
    await expect(ownerState.getLearningState(sessionId)).resolves.toMatchObject({ ok: false, error: 'not-found' });

    const state = createLearningStateService({
      actorId: async () => other.id,
      state: createSupabaseLearningStateClient(admin),
    });
    await expect(state.getLearningState(sessionId)).resolves.toMatchObject({ ok: false, error: 'not-found' });
  });

  it('issues a Russian session from the approved immutable catalog', async () => {
    db = await createDbHarness();
    const owner = await db.actor('l02c-owner-ru');
    actors = [owner];
    const seeded = await seedApprovedPractice(db, 'ru');
    const admin = db.adminClient();
    const replay = createSupabaseLearningReplayClient(admin);
    const start = createLearningStartService({
      actorId: async () => owner.id,
      content: createSupabaseLearningContentClient(admin),
      rpc: admin,
      now: () => new Date(),
      findReplay: ({ actorId, operationId, payloadHash }) => loadStartReplay(replay, actorId, operationId, payloadHash),
    });

    await expect(start.startLearning({
      operationId: crypto.randomUUID(), locale: 'ru', mode: 'practice', topicSlug: seeded.topicSlug,
    })).resolves.toMatchObject({
      ok: true,
      value: { sessions: [{ items: [{ question: { locale: 'ru', body: { stem: 'public' } } }] }] },
    });
  });

  it('submits, restores and reviews a server-issued item through the closed RPC', async () => {
    db = await createDbHarness();
    const owner = await db.actor('l02d-owner');
    const other = await db.actor('l02d-other');
    actors = [owner, other];
    const seeded = await seedApprovedPractice(db, 'kk');
    const admin = db.adminClient();
    const replay = createSupabaseLearningReplayClient(admin);
    const start = createLearningStartService({
      actorId: async () => owner.id,
      content: createSupabaseLearningContentClient(admin),
      rpc: admin,
      now: () => new Date(),
      findReplay: ({ actorId, operationId, payloadHash }) => loadStartReplay(replay, actorId, operationId, payloadHash),
    });
    const started = await start.startLearning({
      operationId: crypto.randomUUID(), locale: 'kk', mode: 'practice', topicSlug: seeded.topicSlug,
    });
    if (!started.ok) throw new Error('start did not issue a session');
    const session = started.value.sessions[0];
    const item = session?.items[0];
    if (!session || !item) throw new Error('issued session did not contain its expected item');

    const submit = createLearningSubmitService({
      actorId: async () => owner.id,
      issued: createSupabaseLearningStateClient(admin),
      rpc: admin,
    });
    const operationId = crypto.randomUUID();
    const input = { operationId, sessionId: session.id, answers: [{ itemId: item.id, answer: 'A', timeSpentMs: 100 }] };
    const accepted = await submit.submitLearning(input);
    expect(accepted).toMatchObject({ ok: true, value: { sessionId: session.id, score: 1, maxScore: 1, integrityVersion: 1 } });
    await expect(submit.submitLearning(input)).resolves.toEqual(accepted);
    await expect(submit.submitLearning({
      ...input,
      answers: [{ itemId: item.id, answer: 'B', timeSpentMs: 100 }],
    })).resolves.toMatchObject({ ok: false, error: 'operation-conflict' });

    const state = createLearningStateService({
      actorId: async () => owner.id,
      state: createSupabaseLearningStateClient(admin),
    });
    await expect(state.getLearningState(session.id)).resolves.toMatchObject({
      ok: true, value: { status: 'submitted', receipt: { sessionId: session.id, score: 1 } },
    });

    const review = createLearningReviewService({
      actorId: async () => owner.id,
      review: createSupabaseLearningReviewClient(admin),
    });
    await expect(review.getLearningReview(session.id)).resolves.toMatchObject({
      ok: true,
      value: { items: [{ itemId: item.id, answer: 'A', points: 1, gradingBody: { correct: 'A' } }] },
    });

    const foreignSubmit = createLearningSubmitService({
      actorId: async () => other.id,
      issued: createSupabaseLearningStateClient(admin),
      rpc: admin,
    });
    await expect(foreignSubmit.submitLearning({ ...input, operationId: crypto.randomUUID() }))
      .resolves.toMatchObject({ ok: false, error: 'not-found' });
  });

  it('keeps expired and quarantined issued sessions as permanent submit outcomes', async () => {
    db = await createDbHarness();
    const owner = await db.actor('l02d-permanent-outcomes');
    actors = [owner];
    const seeded = await seedApprovedPractice(db, 'kk');
    const admin = db.adminClient();
    const replay = createSupabaseLearningReplayClient(admin);
    const start = createLearningStartService({
      actorId: async () => owner.id,
      content: createSupabaseLearningContentClient(admin),
      rpc: admin,
      now: () => new Date(),
      findReplay: ({ actorId, operationId, payloadHash }) => loadStartReplay(replay, actorId, operationId, payloadHash),
    });
    const submit = createLearningSubmitService({
      actorId: async () => owner.id,
      issued: createSupabaseLearningStateClient(admin),
      rpc: admin,
    });
    const startOne = async () => {
      const result = await start.startLearning({
        operationId: crypto.randomUUID(), locale: 'kk', mode: 'practice', topicSlug: seeded.topicSlug,
      });
      if (!result.ok) throw new Error('start did not issue a session');
      const session = result.value.sessions[0];
      const item = session?.items[0];
      if (!session || !item) throw new Error('issued session did not contain its expected item');
      return { session, item };
    };

    const expired = await startOne();
    await db.execute(`UPDATE public.sessions SET expires_at = now() - interval '1 minute' WHERE id = $1`, [expired.session.id]);
    await expect(submit.submitLearning({
      operationId: crypto.randomUUID(), sessionId: expired.session.id, answers: [{ itemId: expired.item.id, answer: 'A', timeSpentMs: 1 }],
    })).resolves.toMatchObject({ ok: false, error: 'expired' });

    const quarantined = await startOne();
    await db.execute(
      `UPDATE public.question_publications SET status = 'quarantined'
       WHERE question_version_id = (SELECT question_version_id FROM public.session_items WHERE id = $1)`,
      [quarantined.item.id],
    );
    await expect(submit.submitLearning({
      operationId: crypto.randomUUID(), sessionId: quarantined.session.id, answers: [{ itemId: quarantined.item.id, answer: 'A', timeSpentMs: 1 }],
    })).resolves.toMatchObject({ ok: false, error: 'content-unavailable' });
  });
});
