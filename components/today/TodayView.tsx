import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ArrowRight, CalendarClock } from 'lucide-react';
import type { Gamification } from '@/lib/supabase/queries';
import { daysUntilExam, projectedPairScore } from '@/lib/plan';
import { EXAM_PAIR_MAX_SCORE } from '@/lib/exam';
import { localDateStr } from '@/lib/streak';
import { ActivityRings, type RingValue } from './ActivityRings';
import { StreakWidget } from './StreakWidget';
import { weekDates } from '@/lib/week';
import { QuoteWidget } from './QuoteWidget';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/types/db';

const WIDGET = 'glass flex min-w-0 flex-col overflow-hidden rounded-3xl p-5';

export type TodayViewProps = {
  locale: Locale;
  name: string;
  dailyGoal: number | null;
  examDate: string | null;
  targetScore: number | null;
  /** Балл диагностики (null — диагностики ещё не было). */
  baselineScore: number | null;
  g: Gamification | null;
  local: boolean;
  hasPracticeTopics: boolean;
  /** Кольцо «Уроки»: null — раздел ещё не подключён к данным (подпись «скоро»). */
  lessons: RingValue;
  /** Книги к повторению сегодня и сколько повторено. */
  books: { due: ReadonlyArray<{ slug: string; name: string; subjectName: string; overdueDays: number }>; reviewedToday: number } | null;
};

/**
 * Экран «Сегодня»: кольца дня, серия, дни до ЕНТ и цитата.
 * Фон — общий градиент приложения (AppBackdrop). Все данные приходят пропсами.
 */
export async function TodayView({
  locale: l,
  name,
  dailyGoal,
  examDate,
  targetScore,
  baselineScore,
  g,
  local,
  hasPracticeTopics,
  lessons,
  books,
}: TodayViewProps) {
  const [t, tDash, tPlan, tProgress] = await Promise.all([
    getTranslations('today'),
    getTranslations('dashboard'),
    getTranslations('plan'),
    getTranslations('progress'),
  ]);

  const today = localDateStr();
  const dateLabel = new Date().toLocaleDateString(l === 'kk' ? 'kk-KZ' : 'ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const dailyTotal = dailyGoal ?? 20;
  const solvedToday = g?.solvedToday ?? 0;
  const examDays = examDate ? Math.max(0, daysUntilExam(examDate)) : null;
  const projected = baselineScore !== null ? projectedPairScore(baselineScore) : null;
  const target = targetScore ?? EXAM_PAIR_MAX_SCORE;

  // Неделя пн → вс: оранжевые кружки — дни, в которые что-то было сделано.
  const active = new Set(g?.activeDates ?? []);
  const letters = t('weekdayLetters').split(',');
  const week = weekDates(today).map((d, i) => ({ letter: letters[i] ?? '', active: active.has(d), today: d === today }));
  const streakDays = g?.currentStreak ?? 0;
  const freezes = g?.streakFreezes ?? 0;
  const record = g?.longestStreak ?? 0;

  const dueCount = books?.due.length ?? 0;
  let nextAction: { href: '/review' | '/problems' | '/subjects' | '/practice'; label: string };
  if (dueCount > 0) {
    nextAction = { href: '/review', label: t('reviewCta', { count: dueCount }) };
  } else if (local) {
    nextAction = { href: '/problems', label: t('openProblemBank') };
  } else if (hasPracticeTopics) {
    nextAction = { href: '/subjects', label: t('choosePracticeTopic') };
  } else {
    nextAction = { href: '/practice', label: t('openPractice') };
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-96px)] max-w-4xl flex-col justify-center gap-8 px-4 py-10 sm:px-6 md:min-h-dvh lg:px-8">
      <div>
        <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{dateLabel}</div>
        <h1 className="mt-2 text-balance text-[clamp(36px,7vw,80px)] font-bold leading-[1.06] tracking-[-0.025em]">
          {tDash('greeting', { name })}
        </h1>
        <Button asChild className="mt-5 min-h-11">
          <Link href={nextAction.href} data-testid="today-primary-action">
            {nextAction.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        {/* Кольца */}
        <div className={`${WIDGET} justify-center`}>
          <ActivityRings
            ariaLabel={t('ringsLabel')}
            labels={[t('ringProblems'), t('ringLessons'), t('ringCards')]}
            soon={t('soon')}
            values={[
              { done: Math.min(solvedToday, dailyTotal), total: dailyTotal },
              lessons,
              books ? { done: books.reviewedToday, total: books.reviewedToday + books.due.length } : null,
            ]}
          />
        </div>

        {/* Серия */}
        <StreakWidget
          title={t('streakTitle')}
          days={streakDays}
          unit={tProgress('streakDays', { count: streakDays })}
          week={week}
          weekLabel={t('weekLabel')}
          startText={tDash('streakStart')}
          freezes={freezes > 0 ? tDash('streakFreezeCount', { count: freezes }) : null}
          record={record > 0 ? t('streakRecordShort', { count: record }) : null}
        />

        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4 sm:col-span-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            {t('examTitle')}
          </div>
          {examDays !== null ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">{examDays}</span>
              <span className="text-sm text-muted-foreground">
                {tPlan('daysUnit', { count: examDays })} · {tPlan('examWeeksUnit', { count: Math.floor(examDays / 7) })}
              </span>
              {projected !== null && (
                <span className="text-sm text-muted-foreground">{t('examProjection', { projected, target })}</span>
              )}
            </div>
          ) : (
            <Link href="/settings" className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline">
              {t('examNoDate')}
            </Link>
          )}
        </div>

        {/* Цитата дня */}
        <QuoteWidget date={today} locale={l} title={t('quoteTitle')} nextLabel={t('quoteNext')} />
      </div>
    </div>
  );
}
