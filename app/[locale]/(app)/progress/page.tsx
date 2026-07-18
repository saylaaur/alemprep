import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { CheckCircle2, XCircle, Flame, TrendingUp, Award } from 'lucide-react';
import {
  getProgressData,
  getProfile,
  getGamification,
  getProgressTrajectory,
} from '@/lib/supabase/queries';
import type { DailyActivity, TopicStat, RecentAttemptItem } from '@/lib/supabase/queries';
import { ACHIEVEMENT_KEYS } from '@/lib/gamification';
import { ACHIEVEMENT_META } from '@/components/gamification/achievement-meta';
import { TrajectoryChart } from '@/components/progress/TrajectoryChart';
import { localDateStr } from '@/lib/streak';
import { EXAM_PAIR_MAX_SCORE } from '@/lib/exam';
import { cn } from '@/lib/utils';
import type { Locale } from '@/types/db';

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profile = await getProfile();
  const userId = profile?.id;

  const [t, tAch, data, g, trajectory] = await Promise.all([
    getTranslations('progress'),
    getTranslations('achievements'),
    getProgressData(),
    userId ? getGamification(userId) : Promise.resolve(null),
    userId ? getProgressTrajectory(userId) : Promise.resolve([]),
  ]);

  const l = locale as Locale;
  const earnedMap = new Map((g?.earned ?? []).map((b) => [b.key, b.earnedAt]));
  const longestStreak = g?.longestStreak ?? 0;

  // Empty state
  if (!data || data.totalAttempts === 0) {
    return (
      <>
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <div className="flex flex-col items-center justify-center gap-6 p-8 pt-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{t('emptyTitle')}</h2>
            <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{t('emptyText')}</p>
          </div>
          <Button asChild>
            <Link href="/subjects">{t('emptyAction')}</Link>
          </Button>
        </div>
      </>
    );
  }

  const accuracyPct =
    data.totalAttempts > 0
      ? Math.round((data.correctAttempts / data.totalAttempts) * 100)
      : 0;

  const heatmap = buildHeatmap(data.dailyActivity);
  const targetPercent = profile?.target_score ? profile.target_score / EXAM_PAIR_MAX_SCORE : undefined;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Summary cards */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t('totalSolved')}</p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{data.totalAttempts}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('attempts', { count: data.totalAttempts })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t('accuracy')}</p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{accuracyPct}%</p>
              <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                {data.correctAttempts} / {data.totalAttempts}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-streak/12">
                <Flame className="h-5 w-5 fill-streak text-streak" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('currentStreak')}</p>
                <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums">
                  {data.currentStreak}{' '}
                  <span className="font-sans text-sm font-normal text-muted-foreground">
                    {t('streakDays', { count: data.currentStreak })}
                  </span>
                </p>
                {longestStreak > 0 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('streakRecord', { count: longestStreak })}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Trajectory: диагностика + еженедельные тесты по времени */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t('trajectoryTitle')}
            <span className="ml-1.5 normal-case font-normal">· {t('trajectorySub')}</span>
          </h2>
          <Card>
            <CardContent className="p-5">
              {trajectory.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <div>
                    <h3 className="text-sm font-semibold">{t('trajectoryEmptyTitle')}</h3>
                    <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                      {t('trajectoryEmptyText')}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href="/diagnostic">{t('trajectoryEmptyAction')}</Link>
                  </Button>
                </div>
              ) : (
                <TrajectoryChart
                  points={trajectory}
                  targetPercent={targetPercent}
                  labels={{
                    diagnostic: t('trajectoryDiagnosticLabel'),
                    week: (n) => t('trajectoryWeekLabel', { n }),
                    target: t('trajectoryTargetLabel'),
                  }}
                />
              )}
            </CardContent>
          </Card>
        </section>

        {/* Activity heatmap */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t('activityTitle')}
            <span className="ml-1.5 normal-case font-normal">· {t('activitySub')}</span>
          </h2>
          <Card>
            <CardContent className="overflow-x-auto p-5">
              <Heatmap weeks={heatmap} />
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t('heatmapLess')}</span>
                <span className="h-3 w-3 rounded-sm bg-muted" />
                <span className="h-3 w-3 rounded-sm bg-success/30" />
                <span className="h-3 w-3 rounded-sm bg-success/60" />
                <span className="h-3 w-3 rounded-sm bg-success" />
                <span>{t('heatmapMore')}</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Badges */}
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            <Award className="h-4 w-4 text-badge-gold" />
            {t('badgesTitle')}
            <span className="ml-1 normal-case font-normal">
              · {earnedMap.size} / {ACHIEVEMENT_KEYS.length}
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ACHIEVEMENT_KEYS.map((key) => {
              const Icon = ACHIEVEMENT_META[key].icon;
              const earned = earnedMap.has(key);
              return (
                <div
                  key={key}
                  className={cn(
                    'flex items-start gap-3 rounded-2xl border p-4',
                    earned
                      ? 'border-badge-gold/30 bg-badge-gold/[0.06]'
                      : 'opacity-60'
                  )}
                >
                  <div
                    className={cn(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                      earned
                        ? 'bg-badge-gold/15 text-badge-gold ring-1 ring-inset ring-badge-gold/35'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{tAch(`${key}.title`)}</div>
                    <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {tAch(`${key}.desc`)}
                    </div>
                    <div
                      className={cn(
                        'mt-1.5 text-[11px]',
                        earned ? 'text-badge-gold' : 'text-muted-foreground/70'
                      )}
                    >
                      {earned
                        ? new Date(earnedMap.get(key)!).toLocaleDateString(
                            l === 'kk' ? 'kk-KZ' : 'ru-RU',
                            { month: 'short', day: 'numeric', year: 'numeric' }
                          )
                        : tAch('lockedHint')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Topic accuracy */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t('topicsTitle')}
            <span className="ml-1.5 normal-case font-normal">· {t('topicsSub')}</span>
          </h2>
          <Card>
            <CardContent className="p-5">
              {data.topicStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('topicsEmpty')}</p>
              ) : (
                <TopicBars stats={data.topicStats} locale={l} />
              )}
            </CardContent>
          </Card>
        </section>

        {/* Recent attempts */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t('recentTitle')}
          </h2>
          <Card>
            {data.recentAttempts.length === 0 ? (
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{t('recentEmpty')}</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-border">
                {data.recentAttempts.map((a) => (
                  <AttemptRow key={a.id} attempt={a} locale={l} />
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}

// ---- Helpers ----

function buildHeatmap(dailyActivity: DailyActivity[]) {
  const byDate = new Map(dailyActivity.map((d) => [d.date, d.count]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0 = Sunday

  // First Sunday of the 12-week window
  const start = new Date(today);
  start.setDate(today.getDate() - dow - 11 * 7);

  const weeks: { date: string; count: number; isFuture: boolean }[][] = [];
  for (let w = 0; w < 12; w++) {
    const days: { date: string; count: number; isFuture: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(start);
      cell.setDate(start.getDate() + w * 7 + d);
      // локальная дата: toISOString сдвигал ячейки на день в TZ восточнее UTC
      const dateStr = localDateStr(cell);
      const isFuture = cell > today;
      days.push({
        date: dateStr,
        count: isFuture ? 0 : (byDate.get(dateStr) ?? 0),
        isFuture,
      });
    }
    weeks.push(days);
  }
  return weeks;
}

function cellClass(count: number, isFuture: boolean): string {
  if (isFuture) return 'bg-muted/30';
  if (count === 0) return 'bg-muted';
  if (count <= 2) return 'bg-success/30';
  if (count <= 5) return 'bg-success/60';
  return 'bg-success';
}

// ---- Sub-components (server) ----

function Heatmap({
  weeks,
}: {
  weeks: { date: string; count: number; isFuture: boolean }[][];
}) {
  return (
    <div className="flex gap-[3px]">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((cell, di) => (
            <div
              key={di}
              title={!cell.isFuture ? `${cell.date}: ${cell.count}` : undefined}
              className={`h-3.5 w-3.5 rounded-sm ${cellClass(cell.count, cell.isFuture)}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function TopicBars({ stats, locale }: { stats: TopicStat[]; locale: Locale }) {
  return (
    <div className="space-y-4">
      {stats.map((s) => {
        const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
        const name = locale === 'kk' ? s.topic_name_kk : s.topic_name_ru;
        const barColor =
          pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-destructive';
        return (
          <div key={s.topic_id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{name}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {pct}% · {s.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AttemptRow({
  attempt,
  locale,
}: {
  attempt: RecentAttemptItem;
  locale: Locale;
}) {
  const name = locale === 'kk' ? attempt.topic_name_kk : attempt.topic_name_ru;
  const date = new Date(attempt.attempted_at).toLocaleDateString(
    locale === 'kk' ? 'kk-KZ' : 'ru-RU',
    { month: 'short', day: 'numeric' }
  );
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="flex items-center gap-3">
        {attempt.is_correct ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <span className="text-sm">{name}</span>
      </div>
      <span className="text-xs text-muted-foreground">{date}</span>
    </div>
  );
}
