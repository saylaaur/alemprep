import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { defaultLocale, locales } from './locales';

export const routing = defineRouting({
  locales,
  defaultLocale,
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
    '/weekly': '/weekly',
    '/progress': '/progress',
    '/settings': '/settings',
    '/teacher': '/teacher',
    '/teacher/groups/[groupId]': '/teacher/groups/[groupId]',
    '/join-class': '/join-class',
    '/visualization': '/visualization',
  },
});

export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
