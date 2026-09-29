import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
import { seedApprovedPilotProgram, type PilotProgram } from '../fixtures/pilot-program';
import { seedPilotSchoolPair, type PilotSchoolPair } from '../fixtures/pilot-school';

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
});
