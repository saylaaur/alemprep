// Review-only regressions for f0492b6. Run with the review config; expected
// behavior assertions intentionally fail until the corresponding findings close.
import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from '../db/helpers';
import { createLearningStartService } from '@/lib/learning/start';
import { createLearningStateService } from '@/lib/learning/state';
import {
  createSupabaseLearningContentClient,
  createSupabaseLearningReplayClient,
  createSupabaseLearningStateClient,
  loadStartReplay,
  loadApprovedLearningVersions,
  type LearningContentClient,
} from '@/lib/learning/repository';
import { selectAssessmentSession } from '@/lib/content/learning-catalog';

describe('L02c server regressions', () => {
  let db: DbHarness;
  let actorId: string | undefined;

  afterEach(async () => {
    try {
      if (actorId) {
        await db.execute('DELETE FROM public.session_items WHERE session_id IN (SELECT id FROM public.sessions WHERE user_id = $1)', [actorId]);
        await db.execute('DELETE FROM public.sessions WHERE user_id = $1', [actorId]);
        await db.execute('DELETE FROM public.operation_receipts WHERE actor_id = $1', [actorId]);
      }
    } finally {
      await db?.close();
      actorId = undefined;
    }
  });

  async function setup() {
    db = await createDbHarness();
    actorId = (await db.actor('l02c-astra-review')).id;
    const slug = `astra-${crypto.randomUUID()}`;
    const subjectId = await db.scalar<string>(
      "INSERT INTO public.subjects (slug,name_ru,name_kk,is_active) VALUES ($1,'Review','Review',true) RETURNING id", [slug],
    );
    const topicId = await db.scalar<string>(
      "INSERT INTO public.topics (subject_id,slug,name_ru,name_kk) VALUES ($1,$2,'Review','Review') RETURNING id", [subjectId, slug],
    );
    async function seed(type: 'single' | 'multi' | 'matching' = 'single', explicitId = crypto.randomUUID()) {
      const publicBody = type === 'matching'
        ? { stem: explicitId, left: [{ id: 'A', content: 'a' }], right: ['1'] }
        : { stem: explicitId, options: [{ id: 'A', content: 'a' }, { id: 'B', content: 'b' }] };
      const gradingBody = { ...publicBody, correct: type === 'single' ? 'A' : type === 'multi' ? ['A'] : { A: '1' } };
      const questionId = await db.scalar<string>(
        'INSERT INTO public.questions (topic_id,language,type,body,is_published) VALUES ($1,\'kk\',$2,$3::jsonb,true) RETURNING id',
        [topicId, type, JSON.stringify(gradingBody)],
      );
      const versionId = await db.scalar<string>(
        `INSERT INTO public.question_versions (id,question_id,family_id,revision,locale,type,public_body,grading_body,content_hash)
         VALUES ($1,$2,gen_random_uuid(),1,'kk',$3,$4::jsonb,$5::jsonb,$6) RETURNING id`,
        [explicitId, questionId, type, JSON.stringify(publicBody), JSON.stringify(gradingBody), `sha256:${explicitId}`],
      );
      await db.execute("INSERT INTO public.question_publications (question_version_id,status) VALUES ($1,'approved')", [versionId]);
      return versionId;
    }
    const admin = db.adminClient();
    const content = createSupabaseLearningContentClient(admin);
    const replay = createSupabaseLearningReplayClient(admin);
    function service(selectedContent: LearningContentClient = content, now: Date = new Date()) {
      return createLearningStartService({
        actorId: async () => actorId!, content: selectedContent, rpc: admin, now: () => now,
        findReplay: (input) => loadStartReplay(replay, input.actorId, input.operationId, input.payloadHash),
      });
    }
    function input(operationId = crypto.randomUUID()) {
      return { operationId, mode: 'practice' as const, locale: 'kk' as const, topicSlug: slug };
    }
    return { seed, admin, content, service, input, slug };
  }

  it('R1: a replay with the same expiry must return the stored winning version', async () => {
    const f = await setup();
    const ids = [(await f.seed()), (await f.seed())].sort();
    const now = new Date();
    let release!: () => void;
    let read!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const readDone = new Promise<void>((resolve) => { read = resolve; });
    const staleContent: LearningContentClient = {
      readApprovedVersions: async (locale, selection) => {
        const rows = await f.content.readApprovedVersions(locale, selection);
        read();
        await blocked;
        return rows;
      },
    };
    const input = f.input();
    const losingStart = f.service(staleContent, now).startLearning(input);
    await readDone;
    let winner;
    try {
      await db.execute("UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1", [ids[0]]);
      winner = await f.service(f.content, now).startLearning(input);
    } finally {
      release();
    }
    const loser = await losingStart;
    expect(winner?.ok).toBe(true);
    expect(loser.ok).toBe(true);
    if (!winner?.ok || !loser.ok) throw new Error('synthetic start failed');
    expect(loser.value.sessions[0]!.id).toBe(winner.value.sessions[0]!.id);
    expect(loser.value.sessions[0]!.items[0]!.id).toBe(winner.value.sessions[0]!.items[0]!.id);
    expect(await db.scalar<string>('SELECT question_version_id FROM public.session_items WHERE id = $1',
      [winner.value.sessions[0]!.items[0]!.id])).toBe(winner.value.sessions[0]!.items[0]!.question.id);
    expect(loser.value.sessions[0]!.items[0]!.question.id).toBe(winner.value.sessions[0]!.items[0]!.question.id);
  });

  it('R2: an active row whose deadline has elapsed must be exposed as expired', async () => {
    const f = await setup();
    await f.seed();
    const started = await f.service().startLearning(f.input());
    if (!started.ok) throw new Error('synthetic start failed');
    const id = started.value.sessions[0]!.id;
    await db.execute("UPDATE public.sessions SET expires_at = now() - interval '1 second' WHERE id = $1", [id]);
    const state = createLearningStateService({ actorId: async () => actorId!, state: createSupabaseLearningStateClient(f.admin) });
    await expect(state.getLearningState(id)).resolves.toMatchObject({ ok: true, value: { status: 'expired', sessionId: id } });
  });

  it('R3: new practice operations must be able to reach more than one approved question', async () => {
    const f = await setup();
    await f.seed();
    await f.seed();
    const service = f.service();
    const selected = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
      const result = await service.startLearning(f.input());
      if (!result.ok) throw new Error('synthetic start failed');
      selected.add(result.value.sessions[0]!.items[0]!.question.id);
    }
    expect(selected.size).toBeGreaterThan(1);
  });

  it('R4: a complete catalog beyond the first 160 singles must satisfy the blueprint', async () => {
    const f = await setup();
    const suffix = crypto.randomUUID().slice(-12);
    for (let index = 0; index < 160; index += 1) {
      await f.seed('single', `${index.toString(16).padStart(8, '0')}-0000-4000-8000-${suffix}`);
    }
    await f.seed('multi', `ffffffff-0000-4000-8000-${suffix}`);
    await f.seed('matching', `ffffffff-0001-4000-8000-${suffix}`);
    const candidates = await loadApprovedLearningVersions(f.content, 'kk', {
      subjectSlugs: [f.slug], types: ['single', 'multi', 'matching'],
    });
    if ('error' in candidates) throw new Error(candidates.error);
    expect(candidates).toHaveLength(162);
    expect(selectAssessmentSession({
      locale: 'kk', mode: 'weekly', subjectSlug: f.slug, candidates,
      blueprint: [{ type: 'single', count: 6 }, { type: 'multi', count: 1 }, { type: 'matching', count: 1 }],
      now: new Date(),
    })).not.toBeNull();
  });
});
