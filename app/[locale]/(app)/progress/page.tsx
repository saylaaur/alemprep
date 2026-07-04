import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { CheckCircle2, XCircle, Flame, TrendingUp } from 'lucide-react';
import { getProgressData } from '@/lib/supabase/queries';
import type { DailyActivity, TopicStat, RecentAttemptItem } from '@/lib/supabase/queries';
import { localDateStr } from '@/lib/streak';
import type { Locale } from '@/types/db';

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, data] = await Promise.all([
    getTranslations('progress'),
    getProgressData(),
  ]);

  const l = locale as Locale;

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

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Summary cards */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t('totalSolved')}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{data.totalAttempts}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('attempts', { count: data.totalAttempts })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t('accuracy')}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{accuracyPct}%</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {data.correctAttempts} / {data.totalAttempts}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10">
                <Flame className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('currentStreak')}</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {data.currentStreak}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    {t('streakDays', { count: data.currentStreak })}
                  </span>
                </p>
              </div>
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
            </CardContent>
          </Card>
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
              <span className="shrink-0 tabular-nums text-muted-foreground">
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
