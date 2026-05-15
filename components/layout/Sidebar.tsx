'use client';

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

export function Sidebar({
  profile,
  email,
}: {
  profile: Profile | null;
  email: string | null;
}) {
  const tNav = useTranslations('nav');
  const tBrand = useTranslations('brand');
  const pathname = usePathname();

  const displayName = profile?.full_name?.trim() || email || '';
  const initial = (displayName[0] ?? '?').toUpperCase();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card/50 backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-6 border-b">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
          <GraduationCap className="h-5 w-5" />
        </div>
        <span className="text-base font-semibold tracking-tight">
          {tBrand('name')}
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {tNav(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 space-y-1">
        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="h-7 w-7 rounded-full"
            />
          ) : (
            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {initial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-medium">{displayName}</div>
            {email && profile?.full_name ? (
              <div className="truncate text-xs text-muted-foreground">{email}</div>
            ) : null}
          </div>
        </div>

        <ThemeToggle />

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            {tNav('signOut')}
          </button>
        </form>
      </div>
    </aside>
  );
}
