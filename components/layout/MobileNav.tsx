'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { signOut } from '@/lib/supabase/auth-actions';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Profile } from '@/types/db';
import {
  LayoutDashboard,
  BookOpen,
  Timer,
  LineChart,
  GraduationCap,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  href: '/dashboard' | '/subjects' | '/full-practice' | '/progress';
  labelKey: 'dashboard' | 'subjects' | 'fullPractice' | 'progress';
  icon: LucideIcon;
};

const items: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/subjects', labelKey: 'subjects', icon: BookOpen },
  { href: '/full-practice', labelKey: 'fullPractice', icon: Timer },
  { href: '/progress', labelKey: 'progress', icon: LineChart },
];

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

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const displayName = profile?.full_name?.trim() || email || '';
  const initial = (displayName[0] ?? '?').toUpperCase();

  return (
    <>
      {/* Top bar (mobile only) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-primary">
            <GraduationCap className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">{tBrand('name')}</span>
        </div>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
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
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-card transition-transform duration-300 ease-smooth md:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Navigation drawer"
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
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200',
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

          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
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
