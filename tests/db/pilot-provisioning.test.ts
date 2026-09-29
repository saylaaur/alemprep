import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';

function rpcRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

describe('pilot school provisioning', () => {
  let db: DbHarness | undefined;

  afterEach(async () => {
    await db?.close();
    db = undefined;
  });

  it('is service-only, atomic, auditable, and safely replayable', async () => {
    db = await createDbHarness();
    const operator = await db.actor('pilot-provision-operator');
    const coordinator = await db.actor('pilot-provision-coordinator');
    const schoolId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const input = {
      operation_id: operationId,
      requested_school_id: schoolId,
      school_name: 'Синтетическая школа provisioning',
      coordinator_id: coordinator.id,
      operator_id: operator.id,
    };

    const browser = await db.rpc(operator, 'pilot_provision_school_v1', input);
    expect(browser.status).toBeGreaterThanOrEqual(400);

    const first = await db.rpc('service', 'pilot_provision_school_v1', input);
    expect(first.status).toBe(200);
    expect(rpcRecord(first.data)).toMatchObject({ schoolId, created: true });
    const replay = await db.rpc('service', 'pilot_provision_school_v1', input);
    expect(replay.status).toBe(200);
    expect(replay.data).toEqual(first.data);
    expect(await db.scalar<number>(`SELECT count(*)::integer FROM public.schools WHERE id = $1`, [schoolId])).toBe(1);
    expect(await db.scalar<number>(
      `SELECT count(*)::integer FROM public.school_memberships WHERE school_id = $1 AND user_id = $2 AND role = 'coordinator'`,
      [schoolId, coordinator.id],
    )).toBe(1);
    expect(await db.scalar<number>(
      `SELECT count(*)::integer FROM public.audit_events WHERE school_id = $1 AND event_type = 'pilot.school_provisioned'`,
      [schoolId],
    )).toBe(1);

    const rejectedSchoolId = crypto.randomUUID();
    const rejected = await db.rpc('service', 'pilot_provision_school_v1', {
      ...input, operation_id: crypto.randomUUID(), requested_school_id: rejectedSchoolId, coordinator_id: crypto.randomUUID(),
    });
    expect(rejected.status).toBe(200);
    expect(rpcRecord(rejected.data)).toMatchObject({ error: 'not-found' });
    expect(await db.scalar<number>(`SELECT count(*)::integer FROM public.schools WHERE id = $1`, [rejectedSchoolId])).toBe(0);
  });
});
