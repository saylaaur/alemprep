import { getTranslations } from 'next-intl/server';
import { BookOpen, BookMarked, CalendarCheck, Flame, Footprints, Library, Repeat, Trophy, TrendingUp, Award, type LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ActivityBars } from '@/components/progress/ActivityBars';
import { addDays } from '@/lib/books/schedule';
import { REVIEW_INTERVALS_DAYS } from '@/lib/books/schedule';
import { localProgress, type LocalAchievementKey } from '@/lib/local/progress';
import { readLocalState } from '@/lib/local/store';
import { getLibrary } from '@/lib/supabase/queries/books';
import { localDateStr } from '@/lib/streak';
import { cn } from '@/lib/utils';
import type { Locale } from '@/types/db';

const ICONS: Record<LocalAchievementKey, LucideIcon> = {
  'first-step': Footprints,
  'streak-3': Flame,
  'streak-7': CalendarCheck,
  'three-topics-day': Library,
  'first-book': BookOpen,
  'book-worm': BookMarked,
  'first-review': Repeat,
  'book-mastered': Trophy,
};

const SECTION_TITLE = 'mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground';

/** «Прогресс» без базы: серия, активность за три недели, достижения и книги. Всё из cookie ученика. */
export async function LocalProgress({ locale }: { locale: Locale }) {
  const [t, tl, ta, tt, state, library] = await Promise.all([
    getTranslations('progress'),
    getTranslations('progressLocal'),
    getTranslations('achievementsLocal'),
    getTranslations('localTest'),
    readLocalState(),
    getLibrary(locale),
  ]);
  const today = localDateStr();
  const p = localProgress(state, today);

  const books = library
    .flatMap((s) => s.topics.flatMap((tp) => tp.books.map((b) => ({ ...b, subject: s.name }))))
    .filter((b) => b.received)
    .sort((a, b) => Number(b.state === 'due') - Number(a.state === 'due') || a.name.localeCompare(b.name));

  if (p.activeDays === 0 && p.booksReceived === 0) {
    return (
      <>
        <PageHeader title={t('title')} subtitle={tl('subtitle')} />
        <div className="flex flex-col items-center justify-center gap-6 p-8 pt-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t('emptyTitle')}</h2>
            <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{tl('emptyText')}</p>
          </div>
          <Button asChild>
            <Link href="/videos">{tl('emptyAction')}</Link>
          </Button>
        </div>
      </>
    );
  }

  const byDate = new Map(p.daily.map((d) => [d.date, d.count]));
  const days = Array.from({ length: p.windowDays }, (_, i) => {
    const date = addDays(today, i - (p.windowDays - 1));
    return { date, count: byDate.get(date) ?? 0, isToday: date === today };
  });
  const earnedCount = p.achievements.filter((a) => a.earned).length;
  const dateLocale = locale === 'kk' ? 'kk-KZ' : 'ru-RU';
  const shortFmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  const dueFmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' });

  return (
    <>
      <PageHeader title={t('title')} subtitle={tl('subtitle')} />
      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        <section className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-3.5 sm:p-5">
              <div className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-streak/12 sm:grid">
                <Flame className="h-5 w-5 fill-streak text-streak" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground sm:text-sm">{t('currentStreak')}</p>
                <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums">
                  {p.streak} <span className="font-sans text-sm font-normal text-muted-foreground">{t('streakDays', { count: p.streak })}</span>
                </p>
                {p.bestStreak > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{t('streakRecord', { count: p.bestStreak })}</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3.5 sm:p-5">
              <p className="text-xs text-muted-foreground sm:text-sm">{tl('activeDays')}</p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{p.activeDays}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{tl('activeDaysSub', { total: p.windowDays })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3.5 sm:p-5">
              <p className="text-xs text-muted-foreground sm:text-sm">{tl('books')}</p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{p.booksReceived}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{tl('booksSub', { reviews: p.reviewsTotal, mastered: p.booksMastered })}</p>
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className={SECTION_TITLE}>
            {t('activityTitle')}
            <span className="ml-1.5 font-normal normal-case">· {tl('activitySub')}</span>
          </h2>
          <Card>
            <CardContent className="p-5">
              <ActivityBars
                days={days}
                label={(date, count) => t('activityCell', { date, count })}
                firstLabel={shortFmt(days[0].date)}
                lastLabel={shortFmt(today)}
              />
            </CardContent>
          </Card>
        </section>

        {state.tests.length > 0 && (
          <section>
            <h2 className={SECTION_TITLE}>{tt('historyTitle')}</h2>
            <Card>
              <CardContent className="divide-y p-0">
                {[...state.tests]
                  .reverse()
                  .slice(0, 5)
                  .map((r, i) => (
                    <div key={`${r.date}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{tt(`historyKind.${r.kind}`)}</div>
                        <div className="text-xs text-muted-foreground">{shortFmt(r.date)}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-mono text-lg font-bold tabular-nums">
                          {r.correct}
                          <span className="text-sm font-normal text-muted-foreground"> / {r.total}</span>
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">{Math.round((r.correct / r.total) * 100)}%</span>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </section>
        )}

        <section>
          <h2 className={cn(SECTION_TITLE, 'flex items-center gap-1.5')}>
            <Award className="h-4 w-4 text-badge-gold" />
            {t('badgesTitle')}
            <span className="ml-1 font-normal normal-case">
              · {earnedCount} / {p.achievements.length}
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {p.achievements.map(({ key, earned }) => {
              const Icon = ICONS[key];
              return (
                <div key={key} className={cn('flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 sm:flex-row sm:gap-3 sm:p-4', earned ? 'border-badge-gold/30 bg-badge-gold/[0.06]' : 'opacity-60')}>
                  <div
                    className={cn(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                      earned ? 'bg-badge-gold/15 text-badge-gold ring-1 ring-inset ring-badge-gold/35' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{ta(`${key}.title`)}</div>
                    <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{ta(`${key}.desc`)}</div>
                    <div className={cn('mt-1.5 text-[11px]', earned ? 'text-badge-gold' : 'text-muted-foreground/70')}>
                      {earned ? ta('earned') : ta('locked')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className={SECTION_TITLE}>{tl('booksListTitle')}</h2>
          {books.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">{tl('booksListEmpty')}</CardContent>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {books.map((b) => {
                const mastered = b.state === 'mastered';
                const step = Math.min(b.stage, REVIEW_INTERVALS_DAYS.length - 1);
                return (
                  <li key={b.slug}>
                    <Link
                      href={{ pathname: '/library/[book]', params: { book: b.slug } }}
                      className="block rounded-2xl border bg-card/70 p-4 transition-[background-color,transform] duration-150 ease-apple hover:bg-muted active:scale-[0.985]"
                    >
                      <div className="text-[15px] font-semibold leading-snug">{b.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {b.subject} ·{' '}
                        {mastered ? tl('mastered') : b.state === 'due' ? tl('dueNow') : b.dueOn ? tl('nextReview', { date: dueFmt(b.dueOn) }) : ''}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={tl('stageOf', { n: step + 1, total: REVIEW_INTERVALS_DAYS.length })}>
                        {REVIEW_INTERVALS_DAYS.map((d, i) => (
                          <span
                            key={d}
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs',
                              mastered || i < b.stage
                                ? 'bg-primary/15 font-medium text-primary'
                                : i === b.stage
                                  ? b.state === 'due'
                                    ? 'bg-streak font-semibold text-[#2b1100]'
                                    : 'bg-muted font-semibold text-foreground ring-1 ring-inset ring-primary/40'
                                  : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
