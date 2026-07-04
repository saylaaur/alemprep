import { routing } from '@/i18n/routing';

export type ResolvedAuthRedirect = { next: string; locale: string };

/**
 * Разбирает параметр `next` после OAuth-колбэка.
 * Принимает только same-origin пути (защита от open redirect) с валидной
 * локалью в первом сегменте; иначе — дашборд дефолтной локали из routing.
 */
export function resolveAuthRedirect(nextParam: string | null): ResolvedAuthRedirect {
  const fallback = `/${routing.defaultLocale}/dashboard`;

  const isSafePath =
    !!nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//');
  if (!isSafePath) return { next: fallback, locale: routing.defaultLocale };

  const rawLocale = nextParam.split('/')[1];
  if (!(routing.locales as readonly string[]).includes(rawLocale)) {
    return { next: fallback, locale: routing.defaultLocale };
  }

  return { next: nextParam, locale: rawLocale };
}
