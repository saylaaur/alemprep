'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { isImmersivePracticePath, isNavItemActive, visibleNavItems } from './nav-items';

export function BottomTabBar({ topicsOnly = false }: { topicsOnly?: boolean }) {
  const tNav = useTranslations('nav');
  const pathname = usePathname();
  if (isImmersivePracticePath(pathname)) return null;
  const items = visibleNavItems(topicsOnly);

  return (
    <nav
      data-hide-in-focus
      aria-label={tNav('menu')}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      className="glass glass-chrome fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid rounded-[28px] shadow-md md:hidden"
    >
      {items.map((item) => {
        const isActive = isNavItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] min-[375px]:text-xs font-medium tracking-tight transition-colors duration-200 ease-apple focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/25',
              isActive ? 'font-semibold text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className={cn(
              'grid h-7 w-10 place-items-center rounded-full transition-colors duration-200 ease-apple',
              isActive && 'bg-primary/[0.12]',
            )}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="max-w-full truncate">{tNav(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
