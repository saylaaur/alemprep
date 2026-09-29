import { describe, expect, it } from 'vitest';
import { parseProvisionSchoolInput } from './provision-school';

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
});
