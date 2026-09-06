export const locales = ['ru', 'kk'] as const;

export const defaultLocale = 'ru';

export type AppLocale = (typeof locales)[number];
