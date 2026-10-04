import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
import { seedPilotSchoolPair } from '../fixtures/pilot-school';
import { createLearningStartService } from '@/lib/learning/start';
import { createLearningSubmitService } from '@/lib/learning/submit';
import { createSupabaseLearningContentClient, createSupabaseLearningStateClient, createSupabaseLearningReplayClient, loadStartReplay } from '@/lib/learning/repository';

describe('teacher self-study dashboard', () => {
  let db: DbHarness;
  afterEach(async () => { await db?.close(); });

  it('lists only assigned active groups, blocks pupils and foreign group URLs', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const own = await db.rpc(school.teacherA, 'pilot_teacher_dashboard_v1', { target_group_id: null });
    expect(own.status).toBe(200);
    expect(own.data).toMatchObject({ groups: [{ id: school.groupA, locale: 'ru' }] });
    expect(JSON.stringify(own.data)).not.toContain(school.groupB);
    expect((await db.rpc(school.studentA, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupA })).data).toEqual({ error: 'not-found' });
    expect((await db.rpc(school.teacherA, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupB })).data).toEqual({ error: 'not-found' });
    expect((await db.rpc('anon', 'pilot_teacher_dashboard_v1', { target_group_id: school.groupA })).status).toBeGreaterThanOrEqual(400);
  });

  it('revokes access when teacher assignment or school is ended', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    await db.execute('UPDATE public.group_teachers SET ended_at = now() WHERE group_id = $1', [school.groupA]);
    expect((await db.rpc(school.teacherA, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupA })).data).toEqual({ error: 'not-found' });
    await db.execute("UPDATE public.schools SET status = 'paused' WHERE id = $1", [school.schoolB]);
    expect((await db.rpc(school.teacherB, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupB })).data).toEqual({ error: 'not-found' });
  });

  it('reports real accepted practice, excludes replay/legacy and keeps first-family score', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const topicSlug = `teacher-report-${crypto.randomUUID()}`;
    const versionId = await db.scalar<string>(`WITH subject AS (
      INSERT INTO public.subjects(slug,name_ru,name_kk,is_active) VALUES($1,'Test','Test',true) RETURNING id
    ), topic AS (
      INSERT INTO public.topics(subject_id,slug,name_ru,name_kk) SELECT id,$1,'Test','Test' FROM subject RETURNING id
    ), question AS (
      INSERT INTO public.questions(topic_id,language,type,body,is_published)
      SELECT id,'ru','single','{"stem":"2+2?","options":[{"id":"A","content":"4"},{"id":"B","content":"5"}],"correct":"A"}',true FROM topic RETURNING id,body
    ) INSERT INTO public.question_versions(question_id,family_id,revision,locale,type,public_body,grading_body,content_hash)
    SELECT id,gen_random_uuid(),1,'ru','single',body-'correct',body,'test-report' FROM question RETURNING id`, [topicSlug]);
    await db.execute("INSERT INTO public.question_publications(question_version_id,status) VALUES($1,'approved')", [versionId]);
    const admin = db.adminClient();
    const replay = createSupabaseLearningReplayClient(admin);
    const start = createLearningStartService({ actorId: async () => school.studentA.id, content: createSupabaseLearningContentClient(admin), rpc: admin, now: () => new Date(), findReplay: ({ actorId, operationId, payloadHash }) => loadStartReplay(replay, actorId, operationId, payloadHash) });
    const submit = createLearningSubmitService({ actorId: async () => school.studentA.id, issued: createSupabaseLearningStateClient(admin), rpc: admin });
    for (let i = 0; i < 2; i++) {
      const issued = await start.startLearning({ operationId: crypto.randomUUID(), locale: 'ru', mode: 'practice', topicSlug });
      expect(issued.ok, JSON.stringify(issued)).toBe(true);
      if (!issued.ok) throw new Error('start rejected');
      const session = issued.value.sessions[0];
      const input = { operationId: crypto.randomUUID(), sessionId: session.id, answers: [{ itemId: session.items[0].id, answer: i === 0 ? 'B' : 'A', timeSpentMs: 100 }] };
      expect((await submit.submitLearning(input)).ok).toBe(true);
      expect((await submit.submitLearning(input)).ok).toBe(true);
    }
    await db.execute(`INSERT INTO public.attempts(user_id,question_id,given_answer,is_correct) SELECT $1,question_id,'"A"',true FROM public.question_versions WHERE id=$2`, [school.studentA.id, versionId]);
    const result = await db.rpc(school.teacherA, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupA });
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ group: { id: school.groupA }, students: [{ id: school.studentA.id, attempts: 2, uniqueQuestions: 1, firstPoints: 0, firstMaxPoints: 1 }] });
    expect(JSON.stringify(result.data)).not.toContain('given_answer');
    await db.execute("UPDATE public.school_memberships SET joined_at=now()-interval '40 days' WHERE id=$1", [school.membershipA]);
    await db.execute("UPDATE public.group_memberships SET joined_at=now()-interval '40 days' WHERE group_id=$1", [school.groupA]);
    await db.execute("UPDATE public.attempts SET attempted_at=now()-interval '31 days' WHERE id=(SELECT id FROM public.attempts WHERE user_id=$1 AND integrity_version=1 ORDER BY attempted_at,id LIMIT 1)", [school.studentA.id]);
    await db.execute("UPDATE public.sessions SET started_at=now()-interval '31 days' WHERE id=(SELECT session_id FROM public.attempts WHERE user_id=$1 AND integrity_version=1 ORDER BY attempted_at,id LIMIT 1)", [school.studentA.id]);
    expect((await db.rpc(school.teacherA, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupA })).data).toMatchObject({ students: [{ attempts: 1, uniqueQuestions: 0, firstPoints: 0, firstMaxPoints: 0 }] });
    await db.execute("UPDATE public.group_memberships SET joined_at=now()+interval '1 minute' WHERE group_id=$1", [school.groupA]);
    expect((await db.rpc(school.teacherA, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupA })).data).toMatchObject({ students: [{ attempts: 0, firstMaxPoints: 0 }] });
    await db.execute("UPDATE public.group_memberships SET joined_at=now()-interval '1 minute' WHERE group_id=$1", [school.groupA]);
    await db.execute('UPDATE public.group_memberships SET ended_at=now() WHERE group_id=$1', [school.groupA]);
    expect((await db.rpc(school.teacherA, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupA })).data).toMatchObject({ students: [] });
  });
});
