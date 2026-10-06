import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
import { expectUnchangedLearning, learningFacts } from './learning-facts';
import { seedApprovedPilotProgram } from '../fixtures/pilot-program';
import { seedPilotSchoolPair } from '../fixtures/pilot-school';

function record(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

async function waitForBlockedRpc(db: DbHarness, rpcName: string, blockerPid: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const blocked = await db.scalar<boolean>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_catalog.pg_stat_activity
         WHERE state = 'active' AND wait_event_type = 'Lock'
           AND query ILIKE $1 AND $2 = ANY(pg_catalog.pg_blocking_pids(pid))
       )`,
      [`%${rpcName}%`, blockerPid],
    );
    if (blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${rpcName} did not wait for the authority-row update`);
}

describe('pilot assigned learning scope', () => {
  let db: DbHarness | undefined;
  afterEach(async () => { await db?.close(); db = undefined; });

  it('issues only the assigned programme item to its snapshotted student', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    const assignmentId = (published.data as { assignmentId: string }).assignmentId;

    const start = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
    });
    expect(start.status, JSON.stringify(start.data)).toBe(200);
    expect(start.data).toMatchObject({ status: 'active', totalSteps: 1, completedSteps: 0 });
    expect(record(start.data)).not.toHaveProperty('sessionItemId');
    const result = start.data as { sessionId: string };
    expect(await db.scalar<string>('SELECT assignment_id FROM public.sessions WHERE id = $1', [result.sessionId]))
      .toBe(assignmentId);
    expect(await db.scalar<string>('SELECT pilot_program_item_id FROM public.sessions WHERE id = $1', [result.sessionId]))
      .toBe(program.itemId);

    const foreign = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentB.id, operation_id: crypto.randomUUID(), payload_hash: 'b'.repeat(64), assignment_id: assignmentId,
    });
    expect(foreign.data).toEqual({ error: 'not-found' });
  });

  it('rejects clearing pilot attribution from an issued session', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const started = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'a'.repeat(64), assignment_id: record(published.data).assignmentId as string,
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const sessionId = record(started.data).sessionId as string;

    await expect(db.execute(
      `UPDATE public.sessions
       SET assignment_id = NULL, assignment_participant_id = NULL, pilot_program_item_id = NULL
       WHERE id = $1`,
      [sessionId],
    )).rejects.toThrow('pilot session attribution is immutable');
    expect(await db.scalar<number>(
      `SELECT count(*)::integer FROM public.sessions
       WHERE id = $1 AND assignment_id IS NOT NULL AND assignment_participant_id IS NOT NULL AND pilot_program_item_id IS NOT NULL`,
      [sessionId],
    )).toBe(1);
  });

  it('rejects replacing an issued pilot item with another question version', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const replacement = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const started = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'a'.repeat(64), assignment_id: record(published.data).assignmentId as string,
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const sessionId = record(started.data).sessionId as string;

    await expect(db.execute(
      `UPDATE public.session_items
       SET question_version_id = $1
       WHERE session_id = $2`,
      [replacement.questionVersionId, sessionId],
    )).rejects.toThrow('pilot session item must match its programme item');
    expect(await db.scalar<string>(
      'SELECT question_version_id FROM public.session_items WHERE session_id = $1',
      [sessionId],
    )).toBe(program.questionVersionId);
  });

  it('waits for group-membership revocation before issuing assigned work', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const assignmentId = record(published.data).assignmentId as string;
    const locker = await db.connection();
    let transactionOpen = false;
    let started: Promise<Awaited<ReturnType<DbHarness['rpc']>>> | undefined;
    try {
      await locker.execute('BEGIN');
      transactionOpen = true;
      await locker.execute(
        `UPDATE public.group_memberships
         SET ended_at = clock_timestamp()
         WHERE group_id = $1 AND school_membership_id = $2`,
        [school.groupA, school.membershipA],
      );
      started = db.rpc('service', 'pilot_start_assigned_learning_v1', {
        actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
        payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
      });
      await waitForBlockedRpc(db, 'pilot_start_assigned_learning_v1', locker.backendPid);
      await locker.execute('COMMIT');
      transactionOpen = false;

      const response = await started;
      expect(response.status, JSON.stringify(response.data)).toBe(200);
      expect(response.data).toEqual({ error: 'not-found' });
      expect(await db.scalar<number>(
        'SELECT count(*)::integer FROM public.sessions WHERE assignment_id = $1', [assignmentId],
      )).toBe(0);
    } finally {
      if (transactionOpen) await locker.execute('ROLLBACK');
      locker.release();
      await started?.catch(() => undefined);
    }
  });

  it('rejects a malformed assigned item binding before scoring', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const replacement = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const assignmentId = record(published.data).assignmentId as string;
    const started = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const sessionId = record(started.data).sessionId as string;
    const sessionItemId = await db.scalar<string>('SELECT id FROM public.session_items WHERE session_id = $1', [sessionId]);
    const versionType = await db.scalar<string>('SELECT type::text FROM public.question_versions WHERE id = $1', [program.questionVersionId]);
    const corruptor = await db.connection();
    try {
      await corruptor.execute('BEGIN');
      await corruptor.execute("SET LOCAL session_replication_role = 'replica'");
      const replacementItemId = await corruptor.scalar<string>(
        `INSERT INTO public.pilot_program_items (program_id, position, question_version_id, locale, purpose)
         SELECT program_id, 1, $1, 'ru', 'practice' FROM public.assignments WHERE id = $2
         RETURNING id`,
        [replacement.questionVersionId, assignmentId],
      );
      await corruptor.execute(
        'UPDATE public.sessions SET pilot_program_item_id = $1 WHERE id = $2',
        [replacementItemId, sessionId],
      );
      await corruptor.execute('COMMIT');
    } finally {
      corruptor.release();
    }

    const rejected = await db.rpc('service', 'commit_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'b'.repeat(64), session_id: sessionId, scoring_version: 'ent-v1',
      graded_items: [{ itemId: sessionItemId, questionVersionId: program.questionVersionId, answer: null,
        points: 0, maxPoints: versionType === 'matching' || versionType === 'multi' ? 2 : 1, timeSpentMs: 0 }],
    });
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'invalid-input' });
    expect(await db.scalar<number>('SELECT count(*)::integer FROM public.attempts WHERE session_id = $1', [sessionId])).toBe(0);
    expect(await db.scalar<number>(
      `SELECT count(*)::integer FROM public.operation_receipts
       WHERE actor_id = $1 AND kind = 'learning.submit'`,
      [school.studentA.id],
    )).toBe(0);
  });

  it('rejects a second live session for the same assigned programme item', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const started = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'a'.repeat(64), assignment_id: record(published.data).assignmentId as string,
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const sessionId = record(started.data).sessionId as string;

    await expect(db.execute(
      `INSERT INTO public.sessions (
         user_id, topic_id, subject_id, mode, total_questions, question_ids,
         integrity_version, operation_id, status, expires_at, scoring_version,
         manifest_hash, assignment_id, assignment_participant_id, pilot_program_item_id
       )
       SELECT user_id, topic_id, subject_id, mode, total_questions, question_ids,
         integrity_version, gen_random_uuid(), 'active', expires_at, scoring_version,
         manifest_hash, assignment_id, assignment_participant_id, pilot_program_item_id
       FROM public.sessions WHERE id = $1`,
      [sessionId],
    )).rejects.toThrow('sessions_assignment_participant_item_live_unique');
    expect(await db.scalar<number>(
      `SELECT count(*)::integer FROM public.sessions
       WHERE assignment_participant_id = (SELECT assignment_participant_id FROM public.sessions WHERE id = $1)
         AND pilot_program_item_id = (SELECT pilot_program_item_id FROM public.sessions WHERE id = $1)
         AND status IN ('active', 'submitted')`,
      [sessionId],
    )).toBe(1);
  });

  it('does not replay active assigned work or accept a fresh submit after withdrawal', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(), due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    const assignmentId = record(published.data).assignmentId as string;
    const startOperation = crypto.randomUUID();
    const started = record((await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: startOperation, payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
    })).data);
    const sessionId = started.sessionId as string;
    const item = await db.adminClient().from('session_items').select('id, question_version_id').eq('session_id', sessionId).single();
    expect(item.error).toBeNull();
    const version = await db.scalar<string>('SELECT type::text FROM public.question_versions WHERE id = $1', [item.data!.question_version_id]);

    await db.execute('UPDATE public.assignment_participants SET withdrawn_at = clock_timestamp() WHERE assignment_id = $1', [assignmentId]);
    const beforeDeniedCalls = await learningFacts(db, school.studentA.id);
    const activeReplay = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: startOperation, payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
    });
    expect(activeReplay.data).toEqual({ error: 'not-found' });

    const freshSubmit = await db.rpc('service', 'commit_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'b'.repeat(64), session_id: sessionId,
      scoring_version: 'ent-v1',
      graded_items: [{ itemId: item.data!.id, questionVersionId: item.data!.question_version_id, answer: null, points: 0, maxPoints: version === 'matching' || version === 'multi' ? 2 : 1, timeSpentMs: 0 }],
    });
    expect(freshSubmit.status, JSON.stringify(freshSubmit.data)).toBe(403);
    expect(record(freshSubmit.data)).toMatchObject({ code: '42501', message: 'forbidden' });
    expect(await db.scalar<number>('SELECT count(*)::integer FROM public.attempts WHERE session_id = $1', [sessionId])).toBe(0);
    await expectUnchangedLearning(db, school.studentA.id, beforeDeniedCalls);
  });

  it('accepts an assigned skip once and preserves its accepted receipt after withdrawal', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const assignmentId = record(published.data).assignmentId as string;
    const started = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const sessionId = record(started.data).sessionId as string;
    const itemId = await db.scalar<string>('SELECT id FROM public.session_items WHERE session_id = $1', [sessionId]);
    const versionType = await db.scalar<string>('SELECT type::text FROM public.question_versions WHERE id = $1', [program.questionVersionId]);
    const submitArgs = {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'b'.repeat(64), session_id: sessionId, scoring_version: 'ent-v1',
      graded_items: [{ itemId, questionVersionId: program.questionVersionId, answer: null,
        points: 0, maxPoints: versionType === 'matching' || versionType === 'multi' ? 2 : 1, timeSpentMs: 0 }],
    };
    const submitted = await db.rpc('service', 'commit_learning_v1', submitArgs);
    expect(submitted.status, JSON.stringify(submitted.data)).toBe(200);
    expect(submitted.data).toMatchObject({ sessionId });
    expect(submitted.data).not.toHaveProperty('error');
    expect(await db.scalar<number>('SELECT count(*)::integer FROM public.attempts WHERE session_id = $1 AND integrity_version = 1', [sessionId])).toBe(1);
    expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [sessionId])).toBe('submitted');

    await db.execute('UPDATE public.assignment_participants SET withdrawn_at = clock_timestamp() WHERE assignment_id = $1', [assignmentId]);
    const beforeReplay = await learningFacts(db, school.studentA.id);
    const replay = await db.rpc('service', 'commit_learning_v1', submitArgs);
    expect(replay.status, JSON.stringify(replay.data)).toBe(200);
    expect(replay.data).toEqual(submitted.data);
    const conflict = await db.rpc('service', 'commit_learning_v1', { ...submitArgs, payload_hash: 'c'.repeat(64) });
    expect(conflict.data).toEqual({ error: 'operation-conflict' });
    await expectUnchangedLearning(db, school.studentA.id, beforeReplay);
  });

  it('refuses quarantined assigned content and audits a newly issued session exactly once', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(), due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    const assignmentId = record(published.data).assignmentId as string;
    await db.execute("UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1", [program.questionVersionId]);
    const quarantined = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'c'.repeat(64), assignment_id: assignmentId,
    });
    expect(quarantined.data).toEqual({ error: 'content-unavailable' });

    await db.execute("UPDATE public.question_publications SET status = 'approved' WHERE question_version_id = $1", [program.questionVersionId]);
    const startArgs = {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'd'.repeat(64), assignment_id: assignmentId,
    };
    const start = await db.rpc('service', 'pilot_start_assigned_learning_v1', startArgs);
    expect(start.status, JSON.stringify(start.data)).toBe(200);
    const started = record(start.data);
    const replay = await db.rpc('service', 'pilot_start_assigned_learning_v1', startArgs);
    expect(replay.data).toEqual(started);
    const reused = await db.rpc('service', 'pilot_start_assigned_learning_v1', { ...startArgs, operation_id: crypto.randomUUID() });
    expect(reused.data).toMatchObject({ status: 'active', sessionId: started.sessionId });
    expect(await db.scalar<number>(
      "SELECT count(*)::integer FROM public.audit_events WHERE entity_type = 'session' AND entity_id = $1 AND event_type = 'pilot.learning_started'",
      [started.sessionId],
    )).toBe(1);
  });

  it('keeps a rejoined student eligible when an old group membership is ended', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(), due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const assignmentId = record(published.data).assignmentId as string;

    await db.execute(
      `UPDATE public.group_memberships SET ended_at = clock_timestamp()
       WHERE group_id = $1 AND school_membership_id = $2`,
      [school.groupA, school.membershipA],
    );
    await db.execute(
      `INSERT INTO public.group_memberships (school_id, group_id, school_membership_id)
       VALUES ($1, $2, $3)`,
      [school.schoolA, school.groupA, school.membershipA],
    );

    const start = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'e'.repeat(64), assignment_id: assignmentId,
    });
    expect(start.status, JSON.stringify(start.data)).toBe(200);
    expect(start.data).toMatchObject({ status: 'active', totalSteps: 1, completedSteps: 0 });
  });

  it('does not count an assigned session as completed without its accepted fact', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(), due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const assignmentId = record(published.data).assignmentId as string;
    const started = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: 'f'.repeat(64), assignment_id: assignmentId,
    });
    expect(started.status, JSON.stringify(started.data)).toBe(200);
    const sessionId = record(started.data).sessionId as string;

    // This is a service-only corruption probe, not a browser-write attack.
    // Completion must still be derived from immutable accepted facts.
    await expect(db.execute(
      "UPDATE public.sessions SET status = 'submitted' WHERE id = $1", [sessionId],
    )).rejects.toThrow('pilot completion requires accepted facts');
    // An expired/cancelled row must not bypass the completion guard either.
    await db.execute("UPDATE public.sessions SET status = 'expired' WHERE id = $1", [sessionId]);
    await expect(db.execute(
      "UPDATE public.sessions SET status = 'submitted' WHERE id = $1", [sessionId],
    )).rejects.toThrow('pilot completion requires accepted facts');
    const next = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: school.studentA.id, operation_id: crypto.randomUUID(),
      payload_hash: '1'.repeat(64), assignment_id: assignmentId,
    });
    expect(next.status, JSON.stringify(next.data)).toBe(200);
    expect(next.data).toMatchObject({ status: 'active', totalSteps: 1, completedSteps: 0 });
    expect(record(next.data).sessionId).not.toBe(sessionId);
    expect(await db.scalar<number>('SELECT count(*)::integer FROM public.attempts WHERE session_id = $1', [sessionId])).toBe(0);
  });

  it('does not deadlock assigned start against a simultaneous assignment publication', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(), due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status, JSON.stringify(published.data)).toBe(200);
    const assignmentId = record(published.data).assignmentId as string;
    const publisher = await db.connection();
    const learner = await db.connection();
    let publisherOpen = false;
    let learnerOpen = false;
    let pendingStart: Promise<string> | undefined;
    try {
      await publisher.execute('BEGIN');
      publisherOpen = true;
      await publisher.execute(
        `SELECT 1 FROM public.school_groups AS target_group
         JOIN public.schools AS target_school ON target_school.id = target_group.school_id
         WHERE target_group.id = $1 FOR UPDATE OF target_group, target_school`,
        [school.groupA],
      );

      await learner.execute('BEGIN');
      learnerOpen = true;
      await learner.execute('SET LOCAL ROLE service_role');
      pendingStart = learner.scalar<string>(
        'SELECT public.pilot_start_assigned_learning_v1($1, $2, $3, $4)::text',
        [school.studentA.id, crypto.randomUUID(), '2'.repeat(64), assignmentId],
      );
      await waitForBlockedRpc(db, 'pilot_start_assigned_learning_v1', publisher.backendPid);

      await publisher.execute("SELECT set_config('request.jwt.claim.sub', $1, true)", [school.teacherA.id]);
      const publishResult = JSON.parse(await publisher.scalar<string>(
        `SELECT public.pilot_publish_assignment_v1(
           $1, $2, $3, clock_timestamp() - interval '1 minute',
           clock_timestamp() + interval '1 hour', clock_timestamp() + interval '2 hours'
         )::text`,
        [crypto.randomUUID(), school.groupA, program.id],
      ));
      expect(publishResult).toMatchObject({ participants: 1 });
      await publisher.execute('ROLLBACK');
      publisherOpen = false;

      const startResult = JSON.parse(await pendingStart);
      expect(startResult).toMatchObject({ status: 'active', totalSteps: 1, completedSteps: 0 });
      await learner.execute('COMMIT');
      learnerOpen = false;
    } finally {
      if (publisherOpen) await publisher.execute('ROLLBACK');
      if (learnerOpen) await learner.execute('ROLLBACK');
      publisher.release();
      learner.release();
      await pendingStart?.catch(() => undefined);
    }
  });

  it('takes the operation lock before assignment authority locks', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const program = await seedApprovedPilotProgram(db);
    const published = await db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(), due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    expect(published.status).toBe(200);
    const assignmentId = record(published.data).assignmentId as string;
    const operationId = crypto.randomUUID();
    const locker = await db.connection();
    const authority = await db.connection();
    let started: Promise<Awaited<ReturnType<DbHarness['rpc']>>> | undefined;
    try {
      await locker.execute('BEGIN');
      await locker.execute('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${school.studentA.id}:${operationId}`]);
      started = db.rpc('service', 'pilot_start_assigned_learning_v1', {
        actor_id: school.studentA.id, operation_id: operationId, payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
      });
      await waitForBlockedRpc(db, 'pilot_start_assigned_learning_v1', locker.backendPid);
      await authority.execute('BEGIN');
      await authority.execute("SET LOCAL lock_timeout='300ms'");
      // A start waiting for its operation must not hold assignment authority.
      await authority.execute("UPDATE public.assignments SET status='cancelled' WHERE id=$1", [assignmentId]);
      await authority.execute('COMMIT');
      await locker.execute('COMMIT');
      expect((await started).data).toEqual({ error: 'not-found' });
    } finally {
      await authority.execute('ROLLBACK');
      await locker.execute('ROLLBACK');
      await started;
      authority.release(); locker.release();
    }
  });
});
