import { describe, expect, it } from 'vitest';
import { parsePublishAssignmentInput } from './contracts';

describe('pilot assignment input', () => {
  const base = {
    operationId: crypto.randomUUID(),
    groupId: crypto.randomUUID(),
    programId: crypto.randomUUID(),
    opensAt: '2026-10-01T08:00:00Z',
    dueAt: '2026-10-01T09:00:00Z',
    closesAt: '2026-10-02T09:00:00Z',
  };

  it('accepts a bounded ordered practice window', () => {
    expect(parsePublishAssignmentInput(base)).toEqual(base);
  });

  it('rejects inverted or overlong windows', () => {
    expect(parsePublishAssignmentInput({ ...base, dueAt: '2026-10-02T10:00:00Z', closesAt: '2026-10-02T09:00:00Z' })).toBeNull();
    expect(parsePublishAssignmentInput({ ...base, closesAt: '2027-01-01T09:00:00Z' })).toBeNull();
  });

  it('rejects browser-supplied actor or participant lists', () => {
    expect(parsePublishAssignmentInput({ ...base, actorId: crypto.randomUUID(), participantIds: [] })).toBeNull();
  });
});
