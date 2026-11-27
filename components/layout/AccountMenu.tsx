'use client';

import { useEffect, useId, useRef, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { LogOut, Settings, UserPlus } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SoundRow } from '@/components/sound/SoundProvider';
import { ThemeToggle } from '@/components/theme-toggle';
import { Link } from '@/i18n/routing';
import { isLocalMode } from '@/lib/data-mode';
import { clearAllSavedExams } from '@/lib/exam-storage';
import { clearPendingLearning } from '@/lib/learning/browser-storage';
import { clearContentProgress } from '@/lib/lessons/progress';
import { signOut } from '@/lib/supabase/auth-actions';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/db';

const ROW = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors duration-200 ease-apple hover:bg-accent/60 hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25';

export function AccountMenu({
  profile,
  email,
  open,
  setOpen,
  desktop = false,
  expanded = false,
}: {
  profile: Profile | null;
  email: string | null;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  desktop?: boolean;
  expanded?: boolean;
}) {
  const t = useTranslations('nav');
  const tSound = useTranslations('lessons.sound');
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const local = isLocalMode();
  const name = profile?.full_name?.trim() || email || t('account');
  const initial = name[0]?.toUpperCase();

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setOpen(false);
      if (container.current?.contains(document.activeElement)) trigger.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [open, setOpen]);

  return (
    <div
      ref={container}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={t('account')}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'grid h-11 items-center rounded-2xl text-left text-sm font-medium transition-colors duration-200 ease-apple hover:bg-foreground/10 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/25',
          desktop ? 'w-full grid-cols-[44px_minmax(0,1fr)]' : 'w-11 place-items-center',
          open && 'bg-foreground/10',
        )}
      >
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="size-8 justify-self-center rounded-full ring-2 ring-border" />
        ) : (
          <span aria-hidden className="grid size-8 place-items-center justify-self-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-2 ring-primary/20">
            {initial}
          </span>
        )}
        {desktop && (
          <span aria-hidden className={cn('truncate pl-2 pr-3 transition-opacity duration-150 ease-apple motion-reduce:transition-none', expanded ? 'delay-75 motion-reduce:delay-0' : 'opacity-0')}>
            {t('account')}
          </span>
        )}
      </button>

      <section
        id={id}
        aria-label={t('account')}
        hidden={!open}
        className={cn(
          'glass glass-chrome absolute z-40 w-64 overflow-y-auto rounded-3xl !bg-background/95 p-2.5 shadow-md motion-safe:animate-fade-in',
          desktop
            ? 'left-full top-0 ml-2 max-h-[calc(100dvh-2.5rem)]'
            : 'right-2 top-full mt-2 max-h-[calc(100dvh-4.5rem)] max-w-[calc(100vw-1rem)]',
        )}
      >
        <div className="mb-1 border-b border-foreground/10 px-3 pb-2 pt-1.5">
          <div className="truncate text-sm font-semibold">{name}</div>
          {email && name !== email && <div className="truncate text-xs text-muted-foreground">{email}</div>}
        </div>

        <div className="space-y-0.5 [&>button]:min-h-11 [&>div]:min-h-11">
          <LanguageSwitcher />
          <ThemeToggle />
          <SoundRow labelOn={tSound('on')} labelOff={tSound('off')} />
          <Link href="/settings" className={ROW} onClick={() => setOpen(false)}>
            <Settings aria-hidden className="size-4 shrink-0" />
            {t('settings')}
          </Link>
          {!local && (
            <>
              <Link href="/join-class" className={ROW} onClick={() => setOpen(false)}>
                <UserPlus aria-hidden className="size-4 shrink-0" />
                {t('joinClass')}
              </Link>
              <form
                action={signOut}
                onSubmit={() => {
                  clearPendingLearning();
                  clearAllSavedExams();
                  clearContentProgress();
                }}
              >
                <button type="submit" className={ROW}>
                  <LogOut aria-hidden className="size-4 shrink-0" />
                  {t('signOut')}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
