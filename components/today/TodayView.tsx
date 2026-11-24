import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { CalendarClock, Flame } from 'lucide-react';
import type { Gamification } from '@/lib/supabase/queries';
import { daysUntilExam, projectedPairScore } from '@/lib/plan';
import { EXAM_PAIR_MAX_SCORE } from '@/lib/exam';
import { localDateStr } from '@/lib/streak';
import { ActivityRings, type RingValue } from './ActivityRings';
import { StreakWidget } from './StreakWidget';
import { weekDates } from '@/lib/week';
import { QuoteWidget } from './QuoteWidget';
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
  subjects: ReadonlyArray<{ id: string; slug: string }>;
  weeklyTest: { availableThisWeek: boolean } | null;
  /** Кольцо «Уроки»: null — раздел ещё не подключён к данным (подпись «скоро»). */
  lessons: RingValue;
  /** Книги к повторению сегодня и сколько повторено. */
  books: { due: ReadonlyArray<{ slug: string; name: string; subjectName: string; overdueDays: number }>; reviewedToday: number };
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

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-96px)] max-w-4xl flex-col justify-center gap-8 px-4 py-10 sm:px-6 md:min-h-dvh lg:px-8">
      <div>
        <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{dateLabel}</div>
        <h1 className="mt-2 text-balance text-[clamp(36px,7vw,80px)] font-extrabold leading-[0.95] tracking-[-0.045em]">
          {tDash('greeting', { name })}
        </h1>
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
              { done: books.reviewedToday, total: books.reviewedToday + books.due.length },
            ]}
          />
          {books.due.length > 0 && (
            <Link
              href="/review"
              className="mt-4 inline-flex items-center justify-center gap-2 self-center rounded-full bg-streak px-5 py-2.5 text-sm font-semibold text-[#2b1100] shadow-[0_0_18px_hsl(var(--streak)/0.4)] transition-[transform,filter] duration-150 ease-apple hover:brightness-105 active:scale-[0.97]"
            >
              <Flame className="h-4 w-4 fill-current" aria-hidden="true" />
              {t('reviewCta', { count: books.due.length })}
            </Link>
          )}
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

        {/* До ЕНТ */}
        <div className={`${WIDGET} min-h-[170px]`}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            {t('examTitle')}
          </div>
          {examDays !== null ? (
            <>
              <div className="mt-auto font-mono text-[56px] font-bold leading-none tabular-nums">{examDays}</div>
              <div className="mt-1.5 text-sm text-muted-foreground">
                {tPlan('daysUnit', { count: examDays })} · {tPlan('examWeeksUnit', { count: Math.floor(examDays / 7) })}
              </div>
              {projected !== null && (
                <div className="mt-0.5 text-sm text-muted-foreground">{t('examProjection', { projected, target })}</div>
              )}
            </>
          ) : (
            <Link href="/settings" className="mt-auto text-sm underline-offset-4 hover:underline">
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
