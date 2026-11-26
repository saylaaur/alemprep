'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GraduationCap, Pin, PinOff } from 'lucide-react';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/db';
import { AccountMenu } from './AccountMenu';
import { visibleNavItems, visibleExtraNavItems } from './nav-items';

const STORAGE_KEY = 'alemprep:nav-open';
const ROW = 'grid h-11 w-full grid-cols-[44px_minmax(0,1fr)] items-center rounded-2xl text-left text-sm font-medium transition-colors focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/25';

export function Sidebar({
  profile,
  email,
  isTeacher = false,
  topicsOnly = false,
}: {
  profile: Profile | null;
  email: string | null;
  isTeacher?: boolean;
  topicsOnly?: boolean;
}) {
  const t = useTranslations('nav');
  const tBrand = useTranslations('brand');
  const pathname = usePathname();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardWithin, setKeyboardWithin] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') setPinned(true);
    } catch {
      // The pin still works for the current page without browser storage.
    }
    return () => clearTimeout(leaveTimer.current);
  }, []);

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // The pin still works for the current page without browser storage.
    }
  };

  const open = pinned || hovered || keyboardWithin || accountOpen;
  const labelClass = cn('truncate pl-2 pr-3 transition-opacity duration-150 motion-reduce:transition-none', !open && 'opacity-0');
  const items = [...visibleNavItems(topicsOnly), ...visibleExtraNavItems(isTeacher)];
  const PinIcon = pinned ? PinOff : Pin;

  return (
    <aside className="relative z-30 hidden w-[88px] shrink-0 md:block">
      <div
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return;
          clearTimeout(leaveTimer.current);
          setHovered(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'mouse') return;
          leaveTimer.current = setTimeout(() => setHovered(false), 160);
        }}
        onFocus={(event) => {
          if (event.target.matches(':focus-visible')) setKeyboardWithin(true);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardWithin(false);
        }}
        className={cn(
          'glass sticky top-3 ml-3 mt-3 flex max-h-[calc(100dvh-1.5rem)] flex-col rounded-[28px] px-[9px] py-2.5 transition-[width,background-color] duration-300 ease-apple motion-reduce:transition-none',
          open ? 'w-64 bg-background/85' : 'w-16',
        )}
      >
        <div className="grid h-11 shrink-0 grid-cols-[44px_minmax(0,1fr)] items-center">
          <span className="grid size-9 place-items-center justify-self-center rounded-xl bg-primary text-primary-foreground shadow-primary">
            <GraduationCap aria-hidden className="size-5" />
          </span>
          <span className={cn(labelClass, 'text-[15px] font-semibold tracking-tight')}>{tBrand('name')}</span>
        </div>

        <nav aria-label={t('menu')} className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const label = t(item.labelKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={open ? undefined : label}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  ROW,
                  active ? 'bg-primary text-primary-foreground shadow-primary' : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                )}
              >
                <Icon aria-hidden className="size-5 justify-self-center" />
                <span aria-hidden className={labelClass}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 shrink-0 space-y-0.5 border-t border-foreground/10 pt-2">
          <AccountMenu profile={profile} email={email} open={accountOpen} setOpen={setAccountOpen} desktop expanded={open} />
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            aria-label={t('pinSidebar')}
            title={pinned ? t('unpinSidebar') : t('pinSidebar')}
            className={cn(ROW, pinned ? 'text-primary' : 'text-muted-foreground', 'hover:bg-foreground/10')}
          >
            <PinIcon aria-hidden className="size-5 justify-self-center" />
            <span aria-hidden className={labelClass}>{pinned ? t('unpinSidebar') : t('pinSidebar')}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
