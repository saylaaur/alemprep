import { describe, expect, it } from 'vitest';
import { createDbHarness } from './helpers';
import { seedApprovedPilotProgram } from '../fixtures/pilot-program';
import { seedPilotSchoolPair } from '../fixtures/pilot-school';

describe('pilot DB harness cleanup', () => {
  it('removes group dependents before synthetic memberships', async () => {
    const fixtureDb = await createDbHarness();
    const fixture = await seedPilotSchoolPair(fixtureDb);
    const membershipIds = [fixture.membershipA, fixture.membershipB];
    const teacherMembershipIds = await Promise.all([
      fixtureDb.scalar<string>('SELECT id FROM public.school_memberships WHERE school_id = $1 AND user_id = $2', [fixture.schoolA, fixture.teacherA.id]),
      fixtureDb.scalar<string>('SELECT id FROM public.school_memberships WHERE school_id = $1 AND user_id = $2', [fixture.schoolB, fixture.teacherB.id]),
    ]);
    await fixtureDb.execute(
      `INSERT INTO public.group_invites (school_id, group_id, token_hash, expires_at, max_uses, created_by_membership_id)
       VALUES ($1, $2, $3, now() + interval '1 day', 1, $4)`,
      [fixture.schoolA, fixture.groupA, 'a'.repeat(64), teacherMembershipIds[0]],
    );
    await fixtureDb.close();

    const inspector = await createDbHarness();
    try {
      expect(await inspector.scalar<number>(
        `SELECT count(*)::integer FROM public.group_memberships WHERE school_membership_id = ANY($1::uuid[])`, [membershipIds],
      )).toBe(0);
      expect(await inspector.scalar<number>(
        `SELECT count(*)::integer FROM public.group_teachers WHERE school_membership_id = ANY($1::uuid[])`, [teacherMembershipIds],
      )).toBe(0);
      expect(await inspector.scalar<number>(
        `SELECT count(*)::integer FROM public.group_invites WHERE created_by_membership_id = ANY($1::uuid[])`, [teacherMembershipIds],
      )).toBe(0);
      expect(await inspector.scalar<number>(
        `SELECT count(*)::integer FROM public.school_memberships WHERE id = ANY($1::uuid[])`, [membershipIds],
      )).toBe(0);
    } finally {
      await inspector.close();
    }
  });

  it('removes assigned sessions and start receipts before deleting synthetic users', async () => {
    const fixtureDb = await createDbHarness();
    const fixture = await seedPilotSchoolPair(fixtureDb);
    const program = await seedApprovedPilotProgram(fixtureDb);
    const published = await fixtureDb.rpc(fixture.teacherA, 'pilot_publish_assignment_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupA, program_id: program.id,
      opens_at: new Date(Date.now() - 60_000).toISOString(),
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      closes_at: new Date(Date.now() + 7_200_000).toISOString(),
    });
    const assignmentId = (published.data as { assignmentId: string }).assignmentId;
    const operationId = crypto.randomUUID();
    const started = await fixtureDb.rpc('service', 'pilot_start_assigned_learning_v1', {
      actor_id: fixture.studentA.id, operation_id: operationId, payload_hash: 'a'.repeat(64), assignment_id: assignmentId,
    });
    const sessionId = (started.data as { sessionId: string }).sessionId;
    await fixtureDb.close();

    const inspector = await createDbHarness();
    try {
      expect(await inspector.scalar<number>('SELECT count(*)::integer FROM public.sessions WHERE id = $1', [sessionId])).toBe(0);
      expect(await inspector.scalar<number>(
        'SELECT count(*)::integer FROM public.pilot_learning_receipts WHERE actor_id = $1 AND operation_id = $2',
        [fixture.studentA.id, operationId],
      )).toBe(0);
    } finally {
      await inspector.close();
    }
  });
});
