import { describe, it, expect } from 'vitest';
import { resolveAuthRedirect } from './auth-redirect';

describe('resolveAuthRedirect', () => {
  it('казахская локаль проходит насквозь (вход с /kk)', () => {
    expect(resolveAuthRedirect('/kk/dashboard')).toEqual({
      next: '/kk/dashboard',
      locale: 'kk',
    });
    expect(resolveAuthRedirect('/kk/full-practice')).toEqual({
      next: '/kk/full-practice',
      locale: 'kk',
    });
  });

  it('русская локаль проходит насквозь', () => {
    expect(resolveAuthRedirect('/ru/dashboard')).toEqual({
      next: '/ru/dashboard',
      locale: 'ru',
    });
  });

  it('нет параметра — дефолт ru', () => {
    expect(resolveAuthRedirect(null)).toEqual({
      next: '/ru/dashboard',
      locale: 'ru',
    });
    expect(resolveAuthRedirect('')).toEqual({
      next: '/ru/dashboard',
      locale: 'ru',
    });
  });

  it('неизвестная локаль в пути — дефолт, а не слепой redirect', () => {
    expect(resolveAuthRedirect('/en/dashboard')).toEqual({
      next: '/ru/dashboard',
      locale: 'ru',
    });
    expect(resolveAuthRedirect('/evil')).toEqual({
      next: '/ru/dashboard',
      locale: 'ru',
    });
  });

  it('open redirect отбрасывается (абсолютные и протокол-относительные URL)', () => {
    expect(resolveAuthRedirect('https://evil.com')).toEqual({
      next: '/ru/dashboard',
      locale: 'ru',
    });
    expect(resolveAuthRedirect('//evil.com/kk/dashboard')).toEqual({
      next: '/ru/dashboard',
      locale: 'ru',
    });
  });
});
