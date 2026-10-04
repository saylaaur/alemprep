import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './middleware';

describe('isProtectedPath', () => {
  it('protects teacher, class join and graph routes in both languages', () => {
    for (const locale of ['ru', 'kk']) {
      for (const route of ['/teacher', '/teacher/groups/example', '/join-class', '/visualization']) {
        expect(isProtectedPath(`/${locale}${route}`)).toBe(true);
      }
    }
  });
  it('protects weekly tests after removing the locale prefix', () => {
    expect(isProtectedPath('/ru/weekly')).toBe(true);
    expect(isProtectedPath('/kk/weekly')).toBe(true);
  });

  it('does not treat the public landing page as private', () => {
    expect(isProtectedPath('/ru')).toBe(false);
  });
});
