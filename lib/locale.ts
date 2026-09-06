import type { Locale } from '@/types/db';

/** Returns the other supported interface locale. */
export function alternateLocale(locale: Locale): Locale {
  return locale === 'ru' ? 'kk' : 'ru';
}

/** Replaces only a leading supported locale, keeping dynamic route segments intact. */
export function withLocalePrefix(pathname: string, locale: Locale): string {
  if (/^\/(ru|kk)(?=\/|$)/.test(pathname)) {
    return pathname.replace(/^\/(ru|kk)(?=\/|$)/, `/${locale}`);
  }
  return `/${locale}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
