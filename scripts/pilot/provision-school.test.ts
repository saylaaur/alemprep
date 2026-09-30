import { describe, expect, it } from 'vitest';
import { parseProvisionCommand, parseProvisionSchoolInput } from './provision-school';

describe('pilot provisioning input', () => {
  const base = {
    schoolName: 'Синтетическая школа',
    operatorId: crypto.randomUUID(),
    coordinatorId: crypto.randomUUID(),
    schoolId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    dryRun: true,
  };

  it('accepts a bounded synthetic provisioning request', () => {
    expect(parseProvisionSchoolInput(base)).toEqual(base);
  });

  it('rejects an invalid user id or unbounded school name', () => {
    expect(parseProvisionSchoolInput({ ...base, operatorId: 'operator' })).toBeNull();
    expect(parseProvisionSchoolInput({ ...base, schoolName: 'x'.repeat(161) })).toBeNull();
  });

  it('requires durable school and operation IDs before an apply command', () => {
    expect(parseProvisionCommand([
      '--apply', '--school-name=Синтетическая школа', `--operator-id=${base.operatorId}`, `--coordinator-id=${base.coordinatorId}`,
    ])).toBeNull();
    expect(parseProvisionCommand([
      '--apply', '--school-name=Синтетическая школа', `--operator-id=${base.operatorId}`, `--coordinator-id=${base.coordinatorId}`,
      `--school-id=${base.schoolId}`, `--operation-id=${base.operationId}`,
    ])).toMatchObject({ ...base, dryRun: false });
  });

  it('prints reusable generated IDs during a dry run', () => {
    const schoolId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const generated = [schoolId, operationId];
    expect(parseProvisionCommand([
      `--school-name=${base.schoolName}`, `--operator-id=${base.operatorId}`, `--coordinator-id=${base.coordinatorId}`,
    ], () => generated.shift()!)).toMatchObject({
      schoolId,
      operationId,
      dryRun: true,
    });
  });
});
