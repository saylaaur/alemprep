import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, CheckCircle2, CircleMinus, Flame, TrendingUp } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ActivityGrid } from '@/components/progress/ActivityGrid';
import { LocalProgress } from '@/components/progress/LocalProgress';
import { ProgressDisclosure } from '@/components/progress/ProgressDisclosure';
import { TrajectoryChart } from '@/components/progress/TrajectoryChart';
import { ACHIEVEMENT_META } from '@/components/gamification/achievement-meta';
import { getGamification, getProfile, getProgressData, getProgressTrajectory } from '@/lib/supabase/queries';
import { ACHIEVEMENT_KEYS } from '@/lib/gamification';
import { buildActivityGrid } from '@/lib/activity-grid';
import { EXAM_PAIR_MAX_SCORE } from '@/lib/exam';
import { PROGRESS_ATTEMPT_LIMIT } from '@/lib/progress';
import { isPilotTopicsOnly } from '@/lib/learning/feature-flag';
import { isLocalMode } from '@/lib/data-mode';
import { cn } from '@/lib/utils';
import type { Locale } from '@/types/db';

const ACTIVITY_DAYS = 60;

export default async function ProgressPage({ params }: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  if (isLocalMode()) return <LocalProgress locale={l} />;

  const [t, format, profile, data] = await Promise.all([
    getTranslations('progress'), getFormatter(), getProfile(), getProgressData(),
  ]);

  if (!data || data.totalAttempts === 0) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="flex flex-col items-start gap-4 p-5 sm:p-7">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <TrendingUp className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold">{t('emptyTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('emptyText')}</p>
              </div>
              <Button asChild className="min-h-11">
                <Link href="/subjects">{t('emptyAction')}<ArrowRight className="size-4" aria-hidden /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const [tAch, gamification, trajectory] = await Promise.all([
    getTranslations('achievements'),
    profile ? getGamification(profile.id) : Promise.resolve(null),
    profile ? getProgressTrajectory(profile.id) : Promise.resolve([]),
  ]);
  const longestStreak = gamification?.longestStreak ?? 0;
  const earned = new Map((gamification?.earned ?? []).map((badge) => [badge.key, badge.earnedAt]));
  const accuracy = format.number(data.correctAttempts / data.totalAttempts, { style: 'percent' });
  const activity = buildActivityGrid(data.dailyActivity, ACTIVITY_DAYS);
  const canTakeDiagnostic = !isPilotTopicsOnly() && Boolean(profile?.second_subject);
  const dateOptions = { month: 'short', day: 'numeric', timeZone: 'Asia/Almaty' } as const;
  const targetPercent = profile?.target_score ? profile.target_score / EXAM_PAIR_MAX_SCORE : undefined;

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <section aria-labelledby="progress-overview">
          <Card>
            <CardContent className="space-y-4 p-4 sm:space-y-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="progress-overview" className="text-lg font-semibold tracking-tight">{t('overview')}</h2>
                <Button asChild size="sm" className="min-h-10">
                  <Link href="/subjects">{t('continuePractice')}<ArrowRight className="size-4" aria-hidden /></Link>
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:gap-3">
                <div className="min-w-0 rounded-xl bg-muted/60 p-2.5 sm:p-4">
                  <dt className="text-xs text-muted-foreground sm:text-sm">{t('attemptTotal')}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums sm:text-3xl">{format.number(data.totalAttempts)}</dd>
                </div>
                <div className="min-w-0 rounded-xl bg-muted/60 p-2.5 sm:p-4">
                  <dt className="text-xs text-muted-foreground sm:text-sm">{t('accuracy')}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums sm:text-3xl">{accuracy}</dd>
                  <dd className="mt-1 text-xs text-muted-foreground">{t('countOutOf', { correct: data.correctAttempts, total: data.totalAttempts })}</dd>
                </div>
                <div className="col-span-2 min-w-0 rounded-xl bg-muted/60 p-2.5 min-[400px]:col-span-1 sm:p-4">
                  <dt className="text-xs text-muted-foreground sm:text-sm">{t('currentStreak')}</dt>
                  <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-xl font-semibold tabular-nums sm:text-3xl">{format.number(data.currentStreak)}</span>
                    <span className="text-xs text-muted-foreground">{t('streakDays', { count: data.currentStreak })}</span>
                    {data.currentStreak > 0 && <Flame className="hidden size-4 self-center text-streak sm:block" aria-hidden />}
                  </dd>
                  {longestStreak > 0 && (
                    <dd className="mt-1 text-xs text-muted-foreground">
                      {t('streakRecord', { count: longestStreak })}
                    </dd>
                  )}
                </div>
              </dl>
              {data.totalAttempts >= PROGRESS_ATTEMPT_LIMIT && (
                <p className="text-xs text-muted-foreground">{t('recentWindow', { total: data.totalAttempts })}</p>
              )}
            </CardContent>
          </Card>
        </section>

        {data.topicStats.length > 0 && (
          <section aria-labelledby="progress-topics">
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div>
                  <h2 id="progress-topics" className="text-lg font-semibold tracking-tight">{t('topicsTitle')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t('topicsSub')}</p>
                </div>
                <ul className="space-y-4">
                  {data.topicStats.map((stat) => {
                    const ratio = stat.correct / stat.total;
                    const name = l === 'kk' ? stat.topic_name_kk : stat.topic_name_ru;
                    return (
                      <li key={stat.topic_id} className="space-y-2">
                        <div className="flex items-start justify-between gap-3 text-sm">
                          <span className="min-w-0 break-words font-medium">{name}</span>
                          <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:text-sm">
                            {t('countOutOf', { correct: stat.correct, total: stat.total })}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}

        <section aria-labelledby="progress-activity">
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div>
                <h2 id="progress-activity" className="text-lg font-semibold tracking-tight">{t('activityTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('activitySub', { days: ACTIVITY_DAYS })}</p>
              </div>
              <ActivityGrid
                weeks={activity}
                months={t('months').split(',')}
                weekdays={t('weekdaysShort').split(',')}
                less={t('heatmapLess')}
                more={t('heatmapMore')}
                cellLabel={(date, count) => t('attemptActivityCell', { date, count })}
                summary={(stats) => t('activitySummary', { active: stats.activeDays, total: stats.totalDays, best: stats.bestRun })}
              />
            </CardContent>
          </Card>
        </section>

        <div className="space-y-2">
          {data.recentAttempts.length > 0 && (
            <ProgressDisclosure title={t('recentTitle')} summary={format.number(data.recentAttempts.length)}>
              <ul className="divide-y">
                {data.recentAttempts.map((attempt) => (
                  <li key={attempt.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex min-w-0 items-start gap-2.5 text-sm">
                      {attempt.is_correct ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                        : <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                      <span className="sr-only">{t(attempt.is_correct ? 'attemptCorrect' : 'attemptIncompleteScore')}</span>
                      <span className="min-w-0 break-words">{l === 'kk' ? attempt.topic_name_kk : attempt.topic_name_ru}</span>
                    </span>
                    <time dateTime={attempt.attempted_at} className="shrink-0 text-xs text-muted-foreground">
                      {format.dateTime(new Date(attempt.attempted_at), dateOptions)}
                    </time>
                  </li>
                ))}
              </ul>
            </ProgressDisclosure>
          )}

          {(trajectory.length > 0 || canTakeDiagnostic) && (
            <ProgressDisclosure title={t('trajectoryTitle')}>
              {trajectory.length > 0 ? (
                <>
                  <p className="mb-3 text-sm text-muted-foreground">{t('trajectorySub')}</p>
                  <TrajectoryChart points={trajectory} targetPercent={targetPercent} labels={{
                    title: t('trajectoryTitle'),
                    diagnostic: t('trajectoryDiagnosticLabel'),
                    week: (n) => t('trajectoryWeekLabel', { n }),
                    target: t('trajectoryTargetLabel'),
                  }} />
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t('trajectoryEmptyText')}</p>
                  <Button asChild size="sm"><Link href="/diagnostic">{t('trajectoryEmptyAction')}</Link></Button>
                </div>
              )}
            </ProgressDisclosure>
          )}

          <ProgressDisclosure title={t('badgesTitle')} summary={`${earned.size} / ${ACHIEVEMENT_KEYS.length}`}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {ACHIEVEMENT_KEYS.map((key) => {
                const Icon = ACHIEVEMENT_META[key].icon;
                const earnedAt = earned.get(key);
                return (
                  <li key={key} className="flex min-w-0 items-start gap-3 rounded-xl border p-3">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', earnedAt ? 'bg-badge-gold/15 text-badge-gold' : 'bg-muted text-muted-foreground')}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{tAch(`${key}.title`)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{tAch(`${key}.desc`)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {earnedAt ? format.dateTime(new Date(earnedAt), { ...dateOptions, year: 'numeric' }) : tAch('lockedHint')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ProgressDisclosure>
        </div>
      </div>
    </>
  );
}
