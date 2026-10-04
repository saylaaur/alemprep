import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
import { seedApprovedPilotProgram } from '../fixtures/pilot-program';
import { seedPilotSchoolPair } from '../fixtures/pilot-school';
import { createSupabaseLearningStateClient, createSupabaseLearningReviewClient, loadLearningState, loadLearningReview } from '@/lib/learning/repository';
import { createAssignedPracticeService } from '@/lib/pilot/learning';
import { createLearningSubmitService } from '@/lib/learning/submit';

describe('active pilot state access', () => {
  let db: DbHarness;
  afterEach(async () => { await db?.close(); });

  it.each(['withdrawn', 'cancelled', 'school-paused', 'group-paused', 'school-membership-ended',
    'group-membership-ended', 'closed', 'quarantined'] as const)('denies active reload after %s', async (reason) => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const closeTime = Date.now() + (reason === 'closed' ? 5_000 : 7_200_000);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(closeTime).toISOString(),
      closes_at: new Date(closeTime).toISOString(),
    });
    expect(published.status).toBe(200);
    const assignmentId = (published.data as { assignmentId: string }).assignmentId;
    const started = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
    });
    expect(started.status).toBe(200);
    const sessionId = (started.data as { sessionId: string }).sessionId;
    const state = createSupabaseLearningStateClient(db.adminClient(), 'reload');
    expect(await loadLearningState(state, school.studentA.id, sessionId)).toMatchObject({ status: 'active' });
    if (reason === 'withdrawn') await db.execute('UPDATE public.assignment_participants SET withdrawn_at=now() WHERE assignment_id=$1', [assignmentId]);
    if (reason === 'cancelled') await db.execute("UPDATE public.assignments SET status='cancelled' WHERE id=$1", [assignmentId]);
    if (reason === 'school-paused') await db.execute("UPDATE public.schools SET status='paused' WHERE id=$1", [school.schoolA]);
    if (reason === 'group-paused') await db.execute("UPDATE public.school_groups SET status='paused' WHERE id=$1", [school.groupA]);
    if (reason === 'school-membership-ended') await db.execute('UPDATE public.school_memberships SET ended_at=now() WHERE id=$1', [school.membershipA]);
    if (reason === 'group-membership-ended') await db.execute('UPDATE public.group_memberships SET ended_at=now() WHERE group_id=$1', [school.groupA]);
    if (reason === 'closed') await new Promise(resolve => setTimeout(resolve, Math.max(0, closeTime - Date.now()) + 25));
    if (reason === 'quarantined') await db.execute("UPDATE public.question_publications SET status='quarantined' WHERE question_version_id=$1", [program.questionVersionId]);
    expect(await loadLearningState(state, school.studentA.id, sessionId)).toEqual(
      reason === 'closed' ? { status: 'expired', sessionId } : { error: 'not-found' },
    );
  });

  it('keeps accepted submit replay and historical review after withdrawal', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(), due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status).toBe(200);
    const assignmentId = (published.data as { assignmentId: string }).assignmentId;
    const admin = db.adminClient();
    const actorId = async () => school.studentA.id;
    const start = createAssignedPracticeService({ actorId, rpc: admin, state: createSupabaseLearningStateClient(admin, 'reload') });
    const startInput = { operationId: crypto.randomUUID(), assignmentId };
    const issued = await start.startAssignedPractice(startInput);
    if (!issued.ok || issued.value.status !== 'active') throw new Error(JSON.stringify(issued));
    const session = issued.value.learning.sessions[0];
    const submit = createLearningSubmitService({ actorId, rpc: admin, issued: createSupabaseLearningStateClient(admin) });
    const input = { operationId: crypto.randomUUID(), sessionId: session.id,
      answers: [{ itemId: session.items[0].id, answer: null, timeSpentMs: 0 }] };
    const receipt = await submit.submitLearning(input);
    expect(receipt.ok, JSON.stringify(receipt)).toBe(true);
    expect(await start.startAssignedPractice(startInput)).toMatchObject({ ok: false, error: 'already-submitted' });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE assignment_id=$1', [assignmentId])).toBe(1);
    await db.execute('UPDATE public.assignment_participants SET withdrawn_at=now() WHERE assignment_id=$1', [assignmentId]);
    expect(await submit.submitLearning(input)).toEqual(receipt);
    expect(await loadLearningState(createSupabaseLearningStateClient(admin, 'reload'), school.studentA.id, session.id)).toMatchObject({ status: 'submitted' });
    expect(await loadLearningReview(createSupabaseLearningReviewClient(admin), school.studentA.id, session.id)).toMatchObject({ receipt: { sessionId: session.id } });
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id=$1', [session.id])).toBe(1);
  });

  it('does not replay historical completion receipts derived from a forged status', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(), due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status).toBe(200);
    const assignmentId = (published.data as { assignmentId: string }).assignmentId;
    const input = { actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'a'.repeat(64), assignment_id: assignmentId };
    const issued = await db.rpc('service', 'pilot_start_assigned_learning_v1', input);
    expect(issued.status).toBe(200);
    const sessionId = (issued.data as { sessionId: string }).sessionId;
    const forgedOperation = crypto.randomUUID();
    const corrupt = await db.connection();
    try {
      await corrupt.execute('BEGIN');
      // Reproduce a historical pre-correction row. Authenticated users cannot
      // disable triggers, update trusted sessions, or insert these receipts.
      await corrupt.execute('ALTER TABLE public.sessions DISABLE TRIGGER sessions_validate_pilot_attribution');
      await corrupt.execute("UPDATE public.sessions SET status='submitted' WHERE id=$1", [sessionId]);
      await corrupt.execute('ALTER TABLE public.sessions ENABLE TRIGGER sessions_validate_pilot_attribution');
      await corrupt.execute(`INSERT INTO public.pilot_learning_receipts(actor_id,operation_id,payload_hash,result)
        VALUES($1,$2,$3,'{"status":"completed","totalSteps":1,"completedSteps":1}')`,
        [school.studentA.id, forgedOperation, 'a'.repeat(64)]);
      await corrupt.execute('COMMIT');
    } finally { await corrupt.execute('ROLLBACK'); corrupt.release(); }
    for (const operationId of [input.operation_id, forgedOperation, crypto.randomUUID()]) {
      expect((await db.rpc('service', 'pilot_start_assigned_learning_v1', { ...input, operation_id: operationId })).data)
        .toEqual({ error: 'temporarily-unavailable' });
    }
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE session_id=$1', [sessionId])).toBe(0);
  });
});
