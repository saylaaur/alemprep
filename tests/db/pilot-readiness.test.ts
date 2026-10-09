import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
import { seedPilotSchoolPair } from '../fixtures/pilot-school';
import { createLearningStartService } from '@/lib/learning/start';
import { createLearningSubmitService } from '@/lib/learning/submit';
import { createLearningStateService } from '@/lib/learning/state';
import { teacherRosterSchema } from '@/lib/teacher/contracts';
import {
  createSupabaseLearningContentClient, createSupabaseLearningReplayClient, createSupabaseLearningStateClient,
  createSupabasePracticeHistoryClient, loadRecentPracticeFamilies, loadStartReplay,
} from '@/lib/learning/repository';

/** Loopback-only regression rehearsal, not a hosted capacity claim. */
describe('two-school pilot readiness rehearsal', () => {
  let db: DbHarness;
  afterEach(async () => { await db?.close(); });
  it('20 pupils start/submit/retry concurrently with exact school reports in RU/KK', async () => {
    db = await createDbHarness();
    const schools = await seedPilotSchoolPair(db);
    await db.execute("UPDATE public.school_groups SET locale='kk' WHERE id=$1", [schools.groupB]);
    const cohorts = [
      { actor: schools.studentA, group: schools.groupA, locale: 'ru' as const },
      { actor: schools.studentB, group: schools.groupB, locale: 'kk' as const },
    ];
    for (let n = 0; n < 18; n++) {
      const a = n < 9; const actor = await db.actor(`pilot-load-${n}`);
      const schoolId = a ? schools.schoolA : schools.schoolB;
      const group = a ? schools.groupA : schools.groupB;
      const membership = await db.scalar<string>("INSERT INTO public.school_memberships(school_id,user_id,role) VALUES($1,$2,'student') RETURNING id", [schoolId, actor.id]);
      await db.execute('INSERT INTO public.group_memberships(school_id,group_id,school_membership_id) VALUES($1,$2,$3)', [schoolId, group, membership]);
      cohorts.push({ actor, group, locale: a ? 'ru' : 'kk' });
    }
    const slug = `pilot-rehearsal-${crypto.randomUUID()}`;
    const topic = await db.scalar<string>(`WITH subject AS (
      INSERT INTO public.subjects(slug,name_ru,name_kk,is_active) VALUES($1,'Synthetic','Synthetic',true) RETURNING id
    ) INSERT INTO public.topics(subject_id,slug,name_ru,name_kk) SELECT id,$1,'Synthetic','Synthetic' FROM subject RETURNING id`, [slug]);
    const family = crypto.randomUUID();
    for (const locale of ['ru', 'kk']) {
      const question = await db.scalar<string>(`INSERT INTO public.questions(topic_id,language,type,body,is_published)
        VALUES($1,$2,'single','{"stem":"2+2?","options":[{"id":"A","content":"4"},{"id":"B","content":"5"}],"correct":"A"}',true) RETURNING id`, [topic, locale]);
      const version = await db.scalar<string>(`INSERT INTO public.question_versions(question_id,family_id,revision,locale,type,public_body,grading_body,content_hash)
        SELECT id,$2,1,$3,'single',body-'correct',body,$4 FROM public.questions WHERE id=$1 RETURNING id`, [question, family, locale, `synthetic-${crypto.randomUUID()}`]);
      await db.execute("INSERT INTO public.question_publications(question_version_id,status) VALUES($1,'approved')", [version]);
    }
    const admin = db.adminClient(); const replay = createSupabaseLearningReplayClient(admin); const history = createSupabasePracticeHistoryClient(admin);
    const startedAt = Date.now(); const durations: number[] = [];
    await Promise.all(cohorts.map(async ({ actor, locale }) => {
      const start = createLearningStartService({ actorId: async () => actor.id, content: createSupabaseLearningContentClient(admin), rpc: admin, now: () => new Date(),
        findReplay: ({ actorId, operationId, payloadHash }) => loadStartReplay(replay, actorId, operationId, payloadHash),
        recentPracticeFamilies: ({ actorId, topicId }) => loadRecentPracticeFamilies(history, actorId, topicId),
      });
      const input = { operationId: crypto.randomUUID(), mode: 'practice' as const, locale, topicSlug: slug };
      const [issued, sameStart] = await Promise.all([start.startLearning(input), start.startLearning(input)]);
      expect(sameStart).toEqual(issued); expect(issued.ok, JSON.stringify(issued)).toBe(true);
      expect(JSON.stringify(issued)).not.toContain('correct');
      if (!issued.ok) throw new Error('rehearsal start failed');
      const session = issued.value.sessions[0]!;
      const submit = createLearningSubmitService({ actorId: async () => actor.id, issued: createSupabaseLearningStateClient(admin), rpc: admin });
      const answer = { operationId: crypto.randomUUID(), sessionId: session.id, answers: [{ itemId: session.items[0]!.id, answer: locale === 'ru' ? 'A' : 'B', timeSpentMs: 1000 }] };
      const beforeSubmit = Date.now();
      const [saved, retried] = await Promise.all([submit.submitLearning(answer), submit.submitLearning(answer)]);
      durations.push(Date.now() - beforeSubmit);
      expect(saved.ok, JSON.stringify(saved)).toBe(true); expect(retried).toEqual(saved);
      const state = createLearningStateService({ actorId: async () => actor.id, state: createSupabaseLearningStateClient(admin, 'reload') });
      expect(await state.getLearningState(session.id)).toMatchObject({ ok: true, value: { status: 'submitted' } });
    }));
    const ids = cohorts.map(cohort => cohort.actor.id);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE user_id=ANY($1::uuid[]) AND integrity_version=1', [ids])).toBe(20);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id=ANY($1::uuid[]) AND integrity_version=1', [ids])).toBe(20);
    for (const [teacher, group, otherGroup, points] of [[schools.teacherA, schools.groupA, schools.groupB, 10], [schools.teacherB, schools.groupB, schools.groupA, 0]] as const) {
      const response = await db.rpc(teacher, 'pilot_teacher_dashboard_v1', { target_group_id: group });
      expect(response.status).toBe(200); const report = teacherRosterSchema.parse(response.data);
      expect(report.students).toHaveLength(10);
      expect(report.students.every(pupil => pupil.attempts === 1 && pupil.uniqueQuestions === 1 && pupil.firstMaxPoints === 1)).toBe(true);
      expect(report.students.reduce((sum, pupil) => sum + pupil.firstPoints, 0)).toBe(points);
      expect((await db.rpc(teacher, 'pilot_teacher_dashboard_v1', { target_group_id: otherGroup })).data).toEqual({ error: 'not-found' });
    }
    const sorted = [...durations].sort((a, b) => a - b);
    console.info(JSON.stringify({ environment: 'local-loopback-only', pupils: 20, acceptedAttempts: 20, concurrentSubmitP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], workloadMs: Date.now() - startedAt }));
  }, 90000);
});
