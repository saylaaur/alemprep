import { defaultLocale, locales } from '@/i18n/locales';

export type ResolvedAuthRedirect = { next: string; locale: string };

/**
 * Разбирает параметр `next` после OAuth-колбэка.
 * Принимает только same-origin пути (защита от open redirect) с валидной
 * локалью в первом сегменте; иначе — дашборд дефолтной локали из routing.
 */
export function resolveAuthRedirect(nextParam: string | null): ResolvedAuthRedirect {
  const fallback = `/${defaultLocale}/dashboard`;

  const isSafePath =
    !!nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//');
  if (!isSafePath) return { next: fallback, locale: defaultLocale };

  const rawLocale = nextParam.split('/')[1];
  if (!(locales as readonly string[]).includes(rawLocale)) {
    return { next: fallback, locale: defaultLocale };
  }

  return { next: nextParam, locale: rawLocale };
}
