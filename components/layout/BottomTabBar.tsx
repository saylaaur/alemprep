'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { navItems, visibleNavItems } from './nav-items';

/** Короткие подписи для таб-бара (полные — в сайдбаре/дровере). */
const TAB_LABEL: Record<(typeof navItems)[number]['href'], string> = {
  '/dashboard': 'home',
  '/videos': 'videos',
  '/library': 'library',
  '/problems': 'problems',
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
export function BottomTabBar({ topicsOnly = false }: { topicsOnly?: boolean }) {
  const tNav = useTranslations('nav');
  const pathname = usePathname();

  const immersive = IMMERSIVE.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (immersive) return null;
  // В таб-баре не больше 6 разделов: «Прогресс» тогда остаётся в меню.
  const all = visibleNavItems(topicsOnly);
  const items = all.length > 6 ? all.filter((i) => i.href !== '/progress') : all;

  return (
    <nav
      data-hide-in-focus
      aria-label={tNav('menu')}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid rounded-[28px] md:hidden"
    >
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-tight min-[400px]:text-[11px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/25',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-[22px] w-[22px]" />
            <span className="max-w-full truncate">{tNav(TAB_LABEL[item.href])}</span>
          </Link>
        );
      })}
    </nav>
  );
}
