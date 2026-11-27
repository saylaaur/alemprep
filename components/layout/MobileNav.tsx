'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, GraduationCap, Users } from 'lucide-react';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/db';
import { AccountMenu } from './AccountMenu';
import { isImmersivePracticePath, isNavItemActive } from './nav-items';

const ICON_LINK = 'grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors duration-200 ease-apple hover:bg-accent hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25';

export function MobileNav({
  profile,
  email,
  isTeacher = false,
}: {
  profile: Profile | null;
  email: string | null;
  isTeacher?: boolean;
}) {
  const t = useTranslations('nav');
  const tBrand = useTranslations('brand');
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const inTeacherCabinet = isNavItemActive(pathname, '/teacher');

  return (
    <header className="glass-chrome sticky top-0 z-30 grid h-14 grid-cols-[44px_minmax(0,1fr)_44px] items-center border-b px-2 md:hidden">
      {isImmersivePracticePath(pathname) ? (
        <Link href="/practice" aria-label={t('backToPractice')} className={ICON_LINK}>
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      ) : isTeacher ? (
        <Link
          href="/teacher"
          aria-label={t('teacher')}
          aria-current={inTeacherCabinet ? 'page' : undefined}
          className={cn(ICON_LINK, inTeacherCabinet && 'bg-primary/15 text-primary')}
        >
          <Users className="size-5" aria-hidden />
        </Link>
      ) : null}

      <div className="col-start-2 row-start-1 flex items-center justify-center gap-2">
        <span className="grid size-6 place-items-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-3.5" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">{tBrand('name')}</span>
      </div>
      <div className="col-start-3 row-start-1">
        <AccountMenu profile={profile} email={email} open={accountOpen} setOpen={setAccountOpen} />
      </div>
    </header>
  );
}
