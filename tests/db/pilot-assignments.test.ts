import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
import { seedApprovedPilotProgram, seedDraftPilotProgram, type PilotProgram } from '../fixtures/pilot-program';
import { seedPilotSchoolPair, type PilotSchoolPair } from '../fixtures/pilot-school';
import { waitForWaitingRelationLock, waitForWaitingRowLock } from './lock-barrier';

function rpcRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function assignmentWindow() {
  const opensAt = new Date(Date.now() - 60_000).toISOString();
  const dueAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const closesAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  return { opens_at: opensAt, due_at: dueAt, closes_at: closesAt };
}

describe('pilot assignments', () => {
  let db: DbHarness | undefined;
  let school: PilotSchoolPair | undefined;
  let program: PilotProgram | undefined;

  afterEach(async () => {
    await db?.close();
    db = undefined;
    school = undefined;
    program = undefined;
  });

  async function setUp() {
    db = await createDbHarness();
    school = await seedPilotSchoolPair(db);
    program = await seedApprovedPilotProgram(db);
    return { db, school, program };
  }

  it('does not let an unassigned teacher publish to a group in their own school', async () => {
    const prepared = await setUp();
    const teacher = await prepared.db.actor('assignment-unassigned-teacher');
    await prepared.db.execute(
      `INSERT INTO public.school_memberships (school_id, user_id, role) VALUES ($1, $2, 'teacher')`,
      [prepared.school.schoolA, teacher.id],
    );

    const response = await prepared.db.rpc(teacher, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: prepared.school.groupA, program_id: prepared.program.id, ...assignmentWindow(),
    });

    expect(response.status).toBe(200);
    expect(rpcRecord(response.data)).toMatchObject({ error: 'not-found' });
  });

  it('returns a safe error for an empty group before it creates an assignment', async () => {
    const prepared = await setUp();
    const emptyGroup = await prepared.db.scalar<string>(
      `INSERT INTO public.school_groups (school_id, name, locale, status)
       VALUES ($1, 'Пустая тестовая группа', 'ru', 'active') RETURNING id`,
      [prepared.school.schoolA],
    );
    const teacherMembership = await prepared.db.scalar<string>(
      `SELECT id FROM public.school_memberships WHERE school_id = $1 AND user_id = $2`,
      [prepared.school.schoolA, prepared.school.teacherA.id],
    );
    await prepared.db.execute(
      `INSERT INTO public.group_teachers (school_id, group_id, school_membership_id) VALUES ($1, $2, $3)`,
      [prepared.school.schoolA, emptyGroup, teacherMembership],
    );

    const response = await prepared.db.rpc(prepared.school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: emptyGroup, program_id: prepared.program.id, ...assignmentWindow(),
    });

    expect(response.status).toBe(200);
    expect(rpcRecord(response.data)).toMatchObject({ error: 'not-found' });
    expect(await prepared.db.scalar<number>('SELECT count(*)::integer FROM public.assignments WHERE group_id = $1', [emptyGroup])).toBe(0);
  });

  it('freezes approved programme contents and prevents a demotion back to draft', async () => {
    const prepared = await setUp();
    const draftProgram = await prepared.db.scalar<string>(
      `INSERT INTO public.pilot_programs (title_ru, status) VALUES ('Черновик', 'draft') RETURNING id`,
    );

    await expect(prepared.db.execute(
      `UPDATE public.pilot_program_items SET program_id = $1 WHERE id = $2`, [draftProgram, prepared.program.itemId],
    )).rejects.toThrow(/immutable/i);
    await expect(prepared.db.execute(
      `UPDATE public.pilot_programs SET status = 'draft' WHERE id = $1`, [prepared.program.id],
    )).rejects.toThrow(/immutable|approved/i);
    await prepared.db.execute(`UPDATE public.pilot_programs SET status = 'retired' WHERE id = $1`, [prepared.program.id]);
    await expect(prepared.db.execute(
      `UPDATE public.pilot_program_items SET position = 1 WHERE id = $1`, [prepared.program.itemId],
    )).rejects.toThrow(/immutable/i);
  });

  it('snapshots participants and allows only an audited cancellation transition', async () => {
    const prepared = await setUp();
    const publish = await prepared.db.rpc(prepared.school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: prepared.school.groupA, program_id: prepared.program.id, ...assignmentWindow(),
    });
    const assignmentId = rpcRecord(publish.data).assignmentId as string;
    expect(typeof assignmentId).toBe('string');
    expect(await prepared.db.scalar<number>(
      `SELECT count(*)::integer FROM public.assignment_participants WHERE assignment_id = $1`, [assignmentId],
    )).toBe(1);

    const laterStudent = await prepared.db.actor('assignment-later-student');
    const laterMembership = await prepared.db.scalar<string>(
      `INSERT INTO public.school_memberships (school_id, user_id, role)
       VALUES ($1, $2, 'student') RETURNING id`, [prepared.school.schoolA, laterStudent.id],
    );
    await prepared.db.execute(
      `INSERT INTO public.group_memberships (school_id, group_id, school_membership_id)
       VALUES ($1, $2, $3)`, [prepared.school.schoolA, prepared.school.groupA, laterMembership],
    );
    expect(await prepared.db.scalar<number>(
      `SELECT count(*)::integer FROM public.assignment_participants WHERE assignment_id = $1`, [assignmentId],
    )).toBe(1);

    const cancelled = await prepared.db.rpc(prepared.school.teacherA, 'pilot_cancel_assignment_v1', {
      operation_id: crypto.randomUUID(), assignment_id: assignmentId,
    });
    expect(cancelled.status).toBe(200);
    expect(rpcRecord(cancelled.data)).toMatchObject({ assignmentId, status: 'cancelled' });
    expect(await prepared.db.scalar<string>(`SELECT status FROM public.assignments WHERE id = $1`, [assignmentId])).toBe('cancelled');
  });

  it('rejects a cancellation that changes immutable assignment fields', async () => {
    const prepared = await setUp();
    const publish = await prepared.db.rpc(prepared.school.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: prepared.school.groupA, program_id: prepared.program.id, ...assignmentWindow(),
    });
    const assignmentId = rpcRecord(publish.data).assignmentId as string;

    await expect(prepared.db.execute(
      `UPDATE public.assignments
       SET status = 'cancelled', revision = revision + 1, due_at = opens_at, closes_at = opens_at
       WHERE id = $1`, [assignmentId],
    )).rejects.toThrow(/immutable/i);
    expect(await prepared.db.scalar<string>(`SELECT status FROM public.assignments WHERE id = $1`, [assignmentId])).toBe('published');
  });

  it('serializes programme approval behind an in-flight item edit', async () => {
    db = await createDbHarness();
    school = await seedPilotSchoolPair(db);
    program = await seedDraftPilotProgram(db);
    const editor = await db.connection();
    const approver = await db.connection();
    try {
      await editor.execute('BEGIN');
      await editor.execute(`UPDATE public.pilot_program_items SET position = 1 WHERE id = $1`, [program.itemId]);
      await approver.execute('BEGIN');
      let approvalSettled = false;
      const approval = approver.execute(`UPDATE public.pilot_programs SET status = 'approved' WHERE id = $1`, [program.id])
        .then(() => { approvalSettled = true; });

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(approvalSettled).toBe(false);
      await editor.execute('COMMIT');
      await approval;
      await approver.execute('COMMIT');
      expect(await db.scalar<number>(`SELECT position FROM public.pilot_program_items WHERE id = $1`, [program.itemId])).toBe(1);
    } finally {
      await Promise.allSettled([editor.execute('ROLLBACK'), approver.execute('ROLLBACK')]);
      editor.release();
      approver.release();
    }
  });

  it('rejects a pending item edit after a programme becomes approved', async () => {
    db = await createDbHarness();
    const draftProgram = await seedDraftPilotProgram(db);
    const approver = await db.connection();
    const editor = await db.connection();
    try {
      await approver.execute('BEGIN');
      await approver.execute(`UPDATE public.pilot_programs SET status = 'approved' WHERE id = $1`, [draftProgram.id]);
      await editor.execute('BEGIN');
      let editSettled = false;
      const edit = editor.execute(`UPDATE public.pilot_program_items SET position = 1 WHERE id = $1`, [draftProgram.itemId])
        .finally(() => { editSettled = true; });

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(editSettled).toBe(false);
      await approver.execute('COMMIT');
      await expect(edit).rejects.toThrow(/immutable/i);
    } finally {
      await Promise.allSettled([approver.execute('ROLLBACK'), editor.execute('ROLLBACK')]);
      approver.release();
      editor.release();
    }
  });

  it('does not freeze an empty or unpublished programme as approved', async () => {
    db = await createDbHarness();
    const emptyProgramId = await db.scalar<string>(
      `INSERT INTO public.pilot_programs (title_ru, status, review_ref)
       VALUES ('Пустая программа', 'draft', 'TEST-REVIEW') RETURNING id`,
    );
    await expect(db.execute(
      `UPDATE public.pilot_programs SET status = 'approved' WHERE id = $1`, [emptyProgramId],
    )).rejects.toThrow(/content|approved/i);

    const invalidProgram = await seedDraftPilotProgram(db);
    await db.execute(
      `UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1`, [invalidProgram.questionVersionId],
    );
    await expect(db.execute(
      `UPDATE public.pilot_programs SET status = 'approved' WHERE id = $1`, [invalidProgram.id],
    )).rejects.toThrow(/content|approved/i);

    const localeMismatchProgram = await seedDraftPilotProgram(db);
    await db.execute(
      `UPDATE public.pilot_program_items SET locale = 'kk' WHERE id = $1`, [localeMismatchProgram.itemId],
    );
    await expect(db.execute(
      `UPDATE public.pilot_programs SET status = 'approved' WHERE id = $1`, [localeMismatchProgram.id],
    )).rejects.toThrow(/content|approved/i);
  });

  it('requires pilot programmes to be created as drafts before approval', async () => {
    db = await createDbHarness();

    await expect(db.execute(
      `INSERT INTO public.pilot_programs (title_ru, status, review_ref)
       VALUES ('Нельзя создать утверждённой', 'approved', 'TEST-REVIEW')`,
    )).rejects.toThrow(/draft|approval/i);
    await expect(db.execute(
      `INSERT INTO public.pilot_programs (title_ru, status, review_ref)
       VALUES ('Нельзя создать архивной', 'retired', 'TEST-REVIEW')`,
    )).rejects.toThrow(/draft|approval/i);

    const draftId = await db.scalar<string>(
      `INSERT INTO public.pilot_programs (title_ru, status, review_ref)
       VALUES ('Разрешённый черновик', 'draft', 'TEST-REVIEW') RETURNING id`,
    );
    expect(typeof draftId).toBe('string');
  });

  it('holds participant membership through the assignment snapshot', async () => {
    const prepared = await setUp();
    const membershipId = prepared.school.membershipA;
    const blocker = await prepared.db.connection();
    const publisher = await prepared.db.connection();
    try {
      await blocker.execute('BEGIN');
      await blocker.execute(`LOCK TABLE public.assignments IN SHARE MODE`);
      await publisher.execute('BEGIN');
      await publisher.execute(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [prepared.school.teacherA.id]);
      const started = publisher.scalar<string>(
        `SELECT public.pilot_publish_assignment_v1($1::uuid, $2::uuid, $3::uuid, now(), now() + interval '1 hour', now() + interval '2 hours')::text`,
        [crypto.randomUUID(), prepared.school.groupA, prepared.program.id],
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      let revocationSettled = false;
      const revoke = prepared.db.execute(
        `UPDATE public.school_memberships SET ended_at = clock_timestamp() WHERE id = $1`, [membershipId],
      ).then(() => { revocationSettled = true; });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(revocationSettled).toBe(false);
      await blocker.execute('COMMIT');
      const result = rpcRecord(JSON.parse(await started));
      await publisher.execute('COMMIT');
      await revoke;
      expect(await prepared.db.scalar<number>(
        `SELECT count(*)::integer FROM public.assignment_participants WHERE assignment_id = $1`, [result.assignmentId],
      )).toBe(1);
    } finally {
      await Promise.allSettled([blocker.execute('ROLLBACK'), publisher.execute('ROLLBACK')]);
      blocker.release();
      publisher.release();
    }
  });

  it('serializes teacher-group revocation with an in-flight assignment publication', async () => {
    const prepared = await setUp();
    const blocker = await prepared.db.connection();
    const publisher = await prepared.db.connection();
    const revoker = await prepared.db.connection();
    const observer = await prepared.db.connection();
    try {
      await blocker.execute('BEGIN');
      await blocker.execute('LOCK TABLE public.assignments IN SHARE MODE');
      await publisher.execute('BEGIN');
      await publisher.execute(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [prepared.school.teacherA.id]);
      const publication = publisher.scalar<string>(
        `SELECT public.pilot_publish_assignment_v1(
           $1::uuid, $2::uuid, $3::uuid, now(), now() + interval '1 hour', now() + interval '2 hours'
         )::text`,
        [crypto.randomUUID(), prepared.school.groupA, prepared.program.id],
      );
      await waitForWaitingRelationLock(observer, publisher.backendPid, 'assignments');

      const revocation = revoker.execute(
        `UPDATE public.group_teachers SET ended_at = clock_timestamp()
         WHERE group_id = $1 AND school_membership_id = $2`,
        [prepared.school.groupA, prepared.school.teacherMembershipA],
      );

      await waitForWaitingRowLock(observer, revoker.backendPid);
      await blocker.execute('COMMIT');
      expect(rpcRecord(JSON.parse(await publication))).toHaveProperty('assignmentId');
      await publisher.execute('COMMIT');
      await revocation;
    } finally {
      await Promise.allSettled([blocker.execute('ROLLBACK'), publisher.execute('ROLLBACK')]);
      blocker.release();
      publisher.release();
      revoker.release();
      observer.release();
    }
  });

  it('refuses publication when teacher-group revocation commits first', async () => {
    const prepared = await setUp();
    const revoker = await prepared.db.connection();
    const publisher = await prepared.db.connection();
    const observer = await prepared.db.connection();
    try {
      await revoker.execute('BEGIN');
      await revoker.execute(
        `UPDATE public.group_teachers SET ended_at = clock_timestamp()
         WHERE group_id = $1 AND school_membership_id = $2`,
        [prepared.school.groupA, prepared.school.teacherMembershipA],
      );
      await publisher.execute('BEGIN');
      await publisher.execute(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [prepared.school.teacherA.id]);
      const publication = publisher.scalar<string>(
        `SELECT public.pilot_publish_assignment_v1(
           $1::uuid, $2::uuid, $3::uuid, now(), now() + interval '1 hour', now() + interval '2 hours'
         )::text`,
        [crypto.randomUUID(), prepared.school.groupA, prepared.program.id],
      );

      await waitForWaitingRowLock(observer, publisher.backendPid);
      await revoker.execute('COMMIT');
      expect(rpcRecord(JSON.parse(await publication))).toMatchObject({ error: 'not-found' });
      await publisher.execute('COMMIT');
    } finally {
      await Promise.allSettled([revoker.execute('ROLLBACK'), publisher.execute('ROLLBACK')]);
      revoker.release();
      publisher.release();
      observer.release();
    }
  });
});
