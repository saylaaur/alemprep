import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness, type TestActor } from './helpers';
import { createLearningStartService } from '@/lib/learning/start';
import { createLearningStateService } from '@/lib/learning/state';
import {
  createSupabaseLearningContentClient,
  createSupabaseLearningReplayClient,
  createSupabaseLearningStateClient,
  loadStartReplay,
} from '@/lib/learning/repository';

type Seeded = {
  topicSlug: string;
};

async function seedApprovedPractice(db: DbHarness): Promise<Seeded> {
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
     VALUES ($1, 'kk', 'single', $2::jsonb, true)
     RETURNING id`,
    [topicId, JSON.stringify({ stem: 'private', options: [{ id: 'A', content: 'A' }], correct: 'A' })],
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

  it('starts, restores after quarantine, and hides state from another owner', async () => {
    db = await createDbHarness();
    const owner = await db.actor('l02c-owner');
    const other = await db.actor('l02c-other');
    actors = [owner, other];
    const seeded = await seedApprovedPractice(db);
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

    const first = await start.startLearning(input);
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
    expect(replayed).toEqual(first);

    const ownerState = createLearningStateService({
      actorId: async () => owner.id,
      state: createSupabaseLearningStateClient(admin),
    });
    await expect(ownerState.getLearningState(sessionId)).resolves.toMatchObject({
      ok: true,
      value: { status: 'active', session: { id: sessionId, items: [{ question: { body: { stem: 'public' } } }] } },
    });

    const state = createLearningStateService({
      actorId: async () => other.id,
      state: createSupabaseLearningStateClient(admin),
    });
    await expect(state.getLearningState(sessionId)).resolves.toMatchObject({ ok: false, error: 'not-found' });
  });
});
