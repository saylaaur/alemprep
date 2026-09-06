import { describe, expect, it } from 'vitest';
import { alternateLocale, withLocalePrefix } from './locale';

describe('alternateLocale', () => {
  it('switches between each supported locale', () => {
    expect(alternateLocale('ru')).toBe('kk');
    expect(alternateLocale('kk')).toBe('ru');
  });
});

describe('withLocalePrefix', () => {
  it('changes only the locale prefix and preserves a dynamic path', () => {
    expect(withLocalePrefix('/ru/practice/topic/logarithms', 'kk')).toBe('/kk/practice/topic/logarithms');
  });

  it('uses the requested prefix for an unprefixed path', () => {
    expect(withLocalePrefix('/login', 'kk')).toBe('/kk/login');
  });
});
