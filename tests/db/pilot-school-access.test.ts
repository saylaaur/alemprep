import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
import { seedPilotSchoolPair, type PilotSchoolPair } from '../fixtures/pilot-school';

function responseRows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

describe('pilot school access boundary', () => {
  let db: DbHarness | undefined;
  let fixture: PilotSchoolPair | undefined;

  afterEach(async () => {
    await db?.close();
    db = undefined;
    fixture = undefined;
  });

  it('does not let an authenticated student read any group roster', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);

    const own = await db.rest(fixture.studentA, `/group_memberships?group_id=eq.${fixture.groupA}&select=id,school_membership_id`);
    const foreign = await db.rest(fixture.studentA, `/group_memberships?group_id=eq.${fixture.groupB}&select=id,school_membership_id`);

    expect(own.status).toBeGreaterThanOrEqual(400);
    expect(responseRows(own.data)).toEqual([]);
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect(responseRows(foreign.data)).toEqual([]);
  });

  it('does not let teacher A create an invite for school B through a forged group ID', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);

    const result = await db.rpc(fixture.teacherA, 'pilot_create_group_invite_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupB, expires_in_hours: 24, max_uses: 1,
    });

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ error: 'not-found' });
  });

  it('rejects a browser attempt to add itself to another school group', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);

    const write = await db.rest(fixture.studentA, '/group_memberships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ school_id: fixture.schoolB, group_id: fixture.groupB, school_membership_id: fixture.membershipB }),
    });

    expect(write.status).toBeGreaterThanOrEqual(400);
  });
});

function rpcRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

describe('pilot group invitations', () => {
  let db: DbHarness | undefined;
  let fixture: PilotSchoolPair | undefined;

  afterEach(async () => {
    await db?.close();
    db = undefined;
    fixture = undefined;
  });

  it('shows an invite secret once, stores only its hash, and replays a safe receipt', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);
    const operationId = crypto.randomUUID();
    const first = await db.rpc(fixture.teacherA, 'pilot_create_group_invite_v1', {
      operation_id: operationId, group_id: fixture.groupA, expires_in_hours: 24, max_uses: 1,
    });
    const firstBody = rpcRecord(first.data);
    const token = firstBody.token;
    expect(first.status).toBe(200);
    expect(typeof token).toBe('string');
    expect((token as string).length).toBeGreaterThanOrEqual(32);

    const storedToken = await db.scalar<string>(
      `SELECT token_hash FROM public.group_invites WHERE id = $1`, [firstBody.inviteId],
    );
    expect(storedToken).not.toBe(token);
    expect(storedToken).toMatch(/^[0-9a-f]{64}$/);

    const replay = await db.rpc(fixture.teacherA, 'pilot_create_group_invite_v1', {
      operation_id: operationId, group_id: fixture.groupA, expires_in_hours: 24, max_uses: 1,
    });
    expect(rpcRecord(replay.data)).toMatchObject({ inviteId: firstBody.inviteId, token: null });
  });

  it('joins exactly one eligible student and rejects a student already scoped to another school', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);
    const invitation = rpcRecord((await db.rpc(fixture.teacherB, 'pilot_create_group_invite_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupB, expires_in_hours: 24, max_uses: 1,
    })).data);
    const token = invitation.token as string;
    const foreign = await db.rpc(fixture.studentA, 'pilot_join_group_v1', {
      operation_id: crypto.randomUUID(), token,
    });
    expect(rpcRecord(foreign.data)).toMatchObject({ error: 'forbidden' });
    expect(await db.scalar<number>('SELECT uses FROM public.group_invites WHERE id = $1', [invitation.inviteId])).toBe(0);

    const joiner = await db.actor('pilot-new-joiner');
    const joined = await db.rpc(joiner, 'pilot_join_group_v1', { operation_id: crypto.randomUUID(), token });
    expect(rpcRecord(joined.data)).toMatchObject({ groupId: fixture.groupB });
    expect(await db.scalar<number>('SELECT uses FROM public.group_invites WHERE id = $1', [invitation.inviteId])).toBe(1);
  });

  it('does not expose the internal school-role helper to browser roles', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);
    const response = await db.rpc(fixture.teacherA, 'pilot_has_active_school_role_v1', {
      target_school_id: fixture.schoolA, allowed_roles: ['teacher'],
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('does not let an unassigned teacher manage a group in their own school', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);
    const unassignedTeacher = await db.actor('pilot-unassigned-teacher');
    await db.execute(
      `INSERT INTO public.school_memberships (school_id, user_id, role)
       VALUES ($1, $2, 'teacher')`,
      [fixture.schoolA, unassignedTeacher.id],
    );

    const invite = await db.rpc(unassignedTeacher, 'pilot_create_group_invite_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupA, expires_in_hours: 24, max_uses: 1,
    });

    expect(invite.status).toBe(200);
    expect(rpcRecord(invite.data)).toMatchObject({ error: 'not-found' });
  });

  it.each([
    ['school', `UPDATE public.schools SET status = 'paused' WHERE id = $1`],
    ['group', `UPDATE public.school_groups SET status = 'archived' WHERE id = $1`],
  ])('does not join an invite after its %s is deactivated', async (_scope, deactivateSql) => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);
    const invitation = rpcRecord((await db.rpc(fixture.teacherA, 'pilot_create_group_invite_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupA, expires_in_hours: 24, max_uses: 1,
    })).data);
    await db.execute(deactivateSql, [_scope === 'school' ? fixture.schoolA : fixture.groupA]);
    const joiner = await db.actor(`pilot-${_scope}-closed-joiner`);

    const joined = await db.rpc(joiner, 'pilot_join_group_v1', {
      operation_id: crypto.randomUUID(), token: invitation.token,
    });

    expect(joined.status).toBe(200);
    expect(rpcRecord(joined.data)).toMatchObject({ error: 'expired' });
    expect(await db.scalar<number>('SELECT uses FROM public.group_invites WHERE id = $1', [invitation.inviteId])).toBe(0);
  });

  it('does not join a link after the issuing teacher is removed from that group', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);
    const invitation = rpcRecord((await db.rpc(fixture.teacherA, 'pilot_create_group_invite_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupA, expires_in_hours: 24, max_uses: 1,
    })).data);
    await db.execute(
      `UPDATE public.group_teachers SET ended_at = clock_timestamp()
       WHERE group_id = $1 AND school_membership_id = (
         SELECT id FROM public.school_memberships WHERE school_id = $2 AND user_id = $3
       )`,
      [fixture.groupA, fixture.schoolA, fixture.teacherA.id],
    );
    const joiner = await db.actor('pilot-revoked-teacher-joiner');

    const joined = await db.rpc(joiner, 'pilot_join_group_v1', {
      operation_id: crypto.randomUUID(), token: invitation.token,
    });

    expect(joined.status).toBe(200);
    expect(rpcRecord(joined.data)).toMatchObject({ error: 'expired' });
    expect(await db.scalar<number>('SELECT uses FROM public.group_invites WHERE id = $1', [invitation.inviteId])).toBe(0);
  });

  it('creates a 72-hour invite using one captured creation timestamp', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);
    const invitation = rpcRecord((await db.rpc(fixture.teacherA, 'pilot_create_group_invite_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupA, expires_in_hours: 72, max_uses: 1,
    })).data);

    const duration = await db.scalar<number>(
      `SELECT EXTRACT(EPOCH FROM expires_at - created_at)::integer FROM public.group_invites WHERE id = $1`, [invitation.inviteId],
    );
    expect(duration).toBe(72 * 60 * 60);
  });

  it('serializes competing joins so one student cannot become active in two schools', async () => {
    db = await createDbHarness();
    fixture = await seedPilotSchoolPair(db);
    const inviteA = rpcRecord((await db.rpc(fixture.teacherA, 'pilot_create_group_invite_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupA, expires_in_hours: 24, max_uses: 1,
    })).data);
    const inviteB = rpcRecord((await db.rpc(fixture.teacherB, 'pilot_create_group_invite_v1', {
      operation_id: crypto.randomUUID(), group_id: fixture.groupB, expires_in_hours: 24, max_uses: 1,
    })).data);
    const joiner = await db.actor('pilot-racing-joiner');
    const first = await db.connection();
    const second = await db.connection();
    try {
      await first.execute('BEGIN');
      await second.execute('BEGIN');
      await first.execute(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [joiner.id]);
      await second.execute(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [joiner.id]);
      const joinedA = await first.scalar<string>(
        `SELECT public.pilot_join_group_v1($1::uuid, $2::text)->>'groupId'`, [crypto.randomUUID(), inviteA.token],
      );
      expect(joinedA).toBe(fixture.groupA);

      let secondSettled = false;
      const joinedB = second.scalar<string>(
        `SELECT public.pilot_join_group_v1($1::uuid, $2::text)->>'groupId'`, [crypto.randomUUID(), inviteB.token],
      ).then((value) => {
        secondSettled = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(secondSettled).toBe(false);
      await first.execute('COMMIT');
      expect(await joinedB).toBeNull();
      await second.execute('COMMIT');
    } finally {
      await Promise.allSettled([first.execute('ROLLBACK'), second.execute('ROLLBACK')]);
      first.release();
      second.release();
    }
  });
});
