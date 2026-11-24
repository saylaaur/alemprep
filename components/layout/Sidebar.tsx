'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { signOut } from '@/lib/supabase/auth-actions';
import { clearContentProgress } from '@/lib/lessons/progress';
import { clearAllSavedExams } from '@/lib/exam-storage';
import { clearPendingLearning } from '@/lib/learning/browser-storage';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SoundRow } from '@/components/sound/SoundProvider';
import type { Profile } from '@/types/db';
import { visibleNavItems, visibleExtraNavItems } from './nav-items';
import { ChevronsLeft, ChevronsRight, Flame, GraduationCap, LogOut } from 'lucide-react';

const STORAGE_KEY = 'alemprep:nav-open';

/**
 * Боковое меню (компьютер). По умолчанию свёрнуто: плавающая стеклянная колонка
 * только с иконками поверх градиента. Стрелка раскрывает подписи и настройки.
 * Раскрытое меню ложится поверх страницы и не двигает контент.
 */
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
  const tNav = useTranslations('nav');
  const tSound = useTranslations('lessons.sound');
  const tBrand = useTranslations('brand');
  const tToday = useTranslations('today');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') setOpen(true);
    } catch {
      /* без хранилища меню просто остаётся свёрнутым */
    }
  }, []);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ок */
      }
      return next;
    });
  };

  const streak = profile?.current_streak ?? 0;
  const displayName = profile?.full_name?.trim() || email || '';
  const initial = (displayName[0] ?? '?').toUpperCase();
  const items = [...visibleNavItems(topicsOnly), ...visibleExtraNavItems(isTeacher)];
  const ToggleIcon = open ? ChevronsLeft : ChevronsRight;

  return (
    <aside className="relative z-30 hidden w-[88px] shrink-0 md:block">
      <div
        className={cn(
          'glass sticky top-3 ml-3 mt-3 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[28px] p-2.5 transition-[width] duration-300 ease-apple',
          open ? 'w-[256px] bg-background/85' : 'w-[64px]'
        )}
      >
        <div className={cn('flex h-11 items-center', open ? 'gap-2.5 px-1' : 'justify-center')}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          {open ? <span className="truncate text-[15px] font-semibold tracking-tight">{tBrand('name')}</span> : null}
        </div>

        {/* Серия дней: оранжевый огонёк с числом (и в свёрнутом, и в раскрытом меню). */}
        {streak > 0 ? (
          <div
            title={tToday('streakTitle')}
            className={cn(
              'mt-2 flex h-9 items-center rounded-2xl bg-streak/12 text-streak',
              open ? 'gap-2 px-3' : 'justify-center gap-1'
            )}
          >
            <Flame className="h-4 w-4 shrink-0 fill-streak" aria-hidden />
            <span className="font-mono text-sm font-bold tabular-nums">{streak}</span>
            {open ? <span className="truncate text-xs font-semibold">{tToday('streakTitle')}</span> : null}
          </div>
        ) : null}

        <nav className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const label = tNav(item.labelKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={open ? undefined : label}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group flex h-11 items-center rounded-2xl text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-200 focus-visible:ring-4 focus-visible:ring-ring/25 active:scale-[0.97]',
                  open ? 'gap-3 px-3' : 'justify-center',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-primary'
                    : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                )}
              >
                <Icon className="h-[20px] w-[20px] shrink-0" />
                {open ? <span className="truncate">{label}</span> : null}
              </Link>
            );
          })}
        </nav>

        {open ? (
          <div className="mt-2 space-y-1 border-t border-foreground/10 pt-2">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full ring-2 ring-border" />
              ) : (
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-2 ring-primary/15">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{displayName}</div>
                {email && profile?.full_name ? <div className="truncate text-xs text-muted-foreground">{email}</div> : null}
              </div>
            </div>

            <ThemeToggle />
            <SoundRow labelOn={tSound('on')} labelOff={tSound('off')} />
            <LanguageSwitcher />

            {/* Прогресс пробника в localStorage — чистим при выходе, чтобы он
                не достался следующему аккаунту на этом устройстве. */}
            <form
              action={signOut}
              onSubmit={() => {
                clearPendingLearning();
                clearAllSavedExams();
                clearContentProgress();
              }}
            >
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-foreground/10 hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
              >
                <LogOut className="h-[18px] w-[18px]" />
                {tNav('signOut')}
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-2 grid place-items-center">
            <div
              title={displayName}
              className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-2 ring-primary/20"
            >
              {initial}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? tNav('closeMenu') : tNav('openMenu')}
          title={open ? tNav('closeMenu') : tNav('openMenu')}
          className={cn(
            'mt-2 flex h-10 items-center rounded-2xl text-muted-foreground transition-[color,background-color,transform] duration-200 hover:bg-foreground/10 hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25 active:scale-[0.97]',
            open ? 'justify-end px-3' : 'justify-center'
          )}
        >
          <ToggleIcon className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
