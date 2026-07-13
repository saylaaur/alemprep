import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['ru', 'kk'],
  defaultLocale: 'ru',
  localePrefix: 'always',
  pathnames: {
    '/': '/',
    '/login': '/login',
    '/onboarding': '/onboarding',
    '/dashboard': '/dashboard',
    '/subjects': '/subjects',
    '/subjects/[subject]': '/subjects/[subject]',
    '/practice/topic/[topic]': '/practice/topic/[topic]',
    '/full-practice': '/full-practice',
    '/diagnostic': '/diagnostic',
    '/progress': '/progress',
    '/settings': '/settings',
  },
});

export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
