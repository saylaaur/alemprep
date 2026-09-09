import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './middleware';

describe('isProtectedPath', () => {
  it('protects weekly tests after removing the locale prefix', () => {
    expect(isProtectedPath('/ru/weekly')).toBe(true);
    expect(isProtectedPath('/kk/weekly')).toBe(true);
  });

  it('does not treat the public landing page as private', () => {
    expect(isProtectedPath('/ru')).toBe(false);
  });
});
