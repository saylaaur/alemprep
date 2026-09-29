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

    expect(own.status).toBe(200);
    expect(responseRows(own.data)).toEqual([]);
    expect(foreign.status).toBe(200);
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
