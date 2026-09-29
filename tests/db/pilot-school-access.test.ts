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
});
