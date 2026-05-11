'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  BookOpen,
  Timer,
  LineChart,
  GraduationCap,
  Settings,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  href: '/dashboard' | '/subjects' | '/full-practice' | '/progress' | '/settings';
  labelKey: 'dashboard' | 'subjects' | 'fullPractice' | 'progress' | 'settings';
  icon: LucideIcon;
};

const items: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/subjects', labelKey: 'subjects', icon: BookOpen },
  { href: '/full-practice', labelKey: 'fullPractice', icon: Timer },
  { href: '/progress', labelKey: 'progress', icon: LineChart },
];

export function Sidebar() {
  const tNav = useTranslations('nav');
  const tBrand = useTranslations('brand');
  const pathname = usePathname();

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

      <div className="border-t p-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          {tNav('settings')}
        </Link>
      </div>
    </aside>
  );
}
