'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { signOut } from '@/lib/supabase/auth-actions';
import { clearAllSavedExams } from '@/lib/exam-storage';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Profile } from '@/types/db';
import { navItems } from './nav-items';
import { GraduationCap, LogOut, Menu, X, Flame } from 'lucide-react';

export function MobileNav({
  profile,
  email,
}: {
  profile: Profile | null;
  email: string | null;
}) {
  const tNav = useTranslations('nav');
  const tBrand = useTranslations('brand');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Escape + фокус-trap. Пока drawer открыт: при открытии фокус уходит внутрь
  // панели, Tab/Shift+Tab циклятся по её фокусируемым элементам и не сбегают на
  // фон, а при закрытии фокус возвращается на кнопку-бургер. (Закрытый drawer
  // выведен из tab-порядка через inert.)
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    // Кнопка-бургер стабильна между открытием/закрытием — снимок для cleanup.
    const trigger = openButtonRef.current;

    const focusable = (): HTMLElement[] =>
      drawer
        ? Array.from(
            drawer.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          )
        : [];

    // Фокус внутрь панели при открытии.
    focusable()[0]?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !drawer?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !drawer?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      // Возврат фокуса на триггер при закрытии.
      trigger?.focus();
    };
  }, [open]);

  const displayName = profile?.full_name?.trim() || email || '';
  const initial = (displayName[0] ?? '?').toUpperCase();
  const streak = profile?.current_streak ?? 0;

  return (
    <>
      {/* Top bar (mobile only): бургер · бренд · стрик */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-2 backdrop-blur-xl md:hidden">
        <button
          ref={openButtonRef}
          type="button"
          aria-label={tNav('openMenu')}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-3.5 w-3.5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">{tBrand('name')}</span>
        </div>
        {streak > 0 ? (
          <div className="flex h-11 items-center gap-1.5 rounded-full bg-streak/12 px-3">
            <Flame className="h-4 w-4 fill-streak text-streak" />
            <span className="font-mono text-sm font-bold tabular-nums text-streak">{streak}</span>
          </div>
        ) : (
          <div className="h-11 w-11" aria-hidden />
        )}
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        inert={!open}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-card transition-transform duration-300 ease-smooth md:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label={tNav('menu')}
      >
        {/* Drawer header */}
        <div className="flex h-14 items-center justify-between border-b px-5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-primary">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">{tBrand('name')}</span>
          </div>
          <button
            type="button"
            aria-label={tNav('closeMenu')}
            onClick={() => setOpen(false)}
            className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 focus-visible:ring-4 focus-visible:ring-ring/25',
                  isActive
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                {tNav(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-3 space-y-1">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm min-h-[44px]">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full ring-2 ring-border" />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-2 ring-primary/15">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">{displayName}</div>
              {email && profile?.full_name && (
                <div className="truncate text-xs text-muted-foreground">{email}</div>
              )}
            </div>
          </div>

          <ThemeToggle />

          {/* Прогресс пробника в localStorage — чистим при выходе, чтобы он
              не достался следующему аккаунту на этом устройстве. */}
          <form action={signOut} onSubmit={() => clearAllSavedExams()}>
            <button
              type="submit"
              className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
            >
              <LogOut className="h-[18px] w-[18px]" />
              {tNav('signOut')}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
