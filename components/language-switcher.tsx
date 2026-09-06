'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { alternateLocale, withLocalePrefix } from '@/lib/locale';
import { cn } from '@/lib/utils';
import type { Locale } from '@/types/db';

type Props = { compact?: boolean };

/** Keeps the current route while changing its /ru or /kk prefix. */
export function LanguageSwitcher({ compact = false }: Props) {
  const t = useTranslations('language');
  const router = useRouter();
  const locale = useLocale() as Locale;
  const nextLocale = alternateLocale(locale);

  const switchLocale = (targetLocale = nextLocale) => {
    const target = withLocalePrefix(window.location.pathname, targetLocale);
    router.push(`${target}${window.location.search}${window.location.hash}`);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => switchLocale()}
        aria-label={nextLocale === 'ru' ? t('switchToRu') : t('switchToKk')}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/80 bg-card/70 px-2.5 text-xs font-semibold text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
      >
        <Languages className="h-3.5 w-3.5 text-primary" />
        <span>{locale === 'ru' ? 'RU' : 'ҚАЗ'}</span>
      </button>
    );
  }

  return (
    <div className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
      <Languages className="h-4 w-4" />
      <span className="flex-1">{t('label')}</span>
      <div className="flex rounded-lg border bg-background/60 p-0.5" role="group" aria-label={t('label')}>
        {(['ru', 'kk'] as const).map((item) => {
          const active = locale === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => !active && switchLocale(item)}
              aria-pressed={active}
              aria-label={item === 'ru' ? t('switchToRu') : t('switchToKk')}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
                active ? 'bg-primary text-primary-foreground shadow-xs' : 'hover:bg-accent hover:text-foreground',
              )}
            >
              {item === 'ru' ? 'RU' : 'ҚАЗ'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
