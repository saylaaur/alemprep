import { describe, expect, it } from 'vitest';
import { parseJoinInput } from './contracts';

describe('pilot join input', () => {
  it('accepts only an operation id and a base64url invite token', () => {
    const operationId = crypto.randomUUID();
    const token = 'A'.repeat(22);
    expect(parseJoinInput({ operationId, token })).toEqual({ operationId, token });
  });

  it('rejects short, malformed and overlong tokens', () => {
    const operationId = crypto.randomUUID();
    expect(parseJoinInput({ operationId, token: 'short' })).toBeNull();
    expect(parseJoinInput({ operationId, token: `${'A'.repeat(21)}!` })).toBeNull();
    expect(parseJoinInput({ operationId, token: 'A'.repeat(129) })).toBeNull();
  });

  it('rejects client-supplied actor or school scope', () => {
    expect(parseJoinInput({
      operationId: crypto.randomUUID(),
      token: 'A'.repeat(22),
      actorId: crypto.randomUUID(),
      schoolId: crypto.randomUUID(),
    })).toBeNull();
  });
});
