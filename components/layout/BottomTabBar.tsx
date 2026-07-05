'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { navItems } from './nav-items';

/** Короткие подписи для таб-бара (полные — в сайдбаре/дровере). */
const TAB_LABEL: Record<(typeof navItems)[number]['href'], string> = {
  '/dashboard': 'home',
  '/subjects': 'subjects',
  '/full-practice': 'exam',
  '/progress': 'progress',
};

/** Иммерсивные экраны — прячем таб-бар, чтобы не мешал (у них свои футеры). */
const IMMERSIVE = ['/practice', '/full-practice'];

/**
 * Нижний таб-бар (только моб.). 4 основных раздела, тач-таргеты ≥44px.
 * Прячется на иммерсивных экранах и в фокус-режиме (data-hide-in-focus).
 */
export function BottomTabBar() {
  const tNav = useTranslations('nav');
  const pathname = usePathname();

  const immersive = IMMERSIVE.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (immersive) return null;

  return (
    <nav
      data-hide-in-focus
      aria-label={tNav('menu')}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/25',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-[22px] w-[22px]" />
            {tNav(TAB_LABEL[item.href])}
          </Link>
        );
      })}
    </nav>
  );
}
