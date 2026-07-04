import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { Link } from '@/i18n/routing';
import { ArrowRight, Flame, Target } from 'lucide-react';
import {
  getProfile,
  getTodayAttemptsCount,
  getSubjectsWithCounts,
  displayName,
  subjectName,
} from '@/lib/supabase/queries';
import { getSubjectIcon } from '@/lib/icons';
import type { Locale } from '@/types/db';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tSubjects, profile, todayDone, subjects] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('subjects'),
    getProfile(),
    getTodayAttemptsCount(),
    getSubjectsWithCounts(),
  ]);

  const dailyTotal = profile?.daily_goal ?? 20;
  const progressPct = Math.min(100, Math.round((todayDone / dailyTotal) * 100));
  const name = displayName(profile) ?? t('defaultName');
  const streak = profile?.current_streak ?? 0;
  const goalReached = todayDone >= dailyTotal;

  // Circular progress geometry
  const R = 34;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - progressPct / 100);

  return (
    <>
      <PageHeader title={t('greeting', { name })} subtitle={t('subtitle')} />

      <div className="space-y-10 p-4 sm:p-6 lg:p-8">
        {/* Top stats */}
        <section className="grid gap-4 md:grid-cols-3">
          {/* Daily goal */}
          <Card className="md:col-span-2">
            <CardContent className="flex items-center gap-6 p-6">
              <div className="relative h-24 w-24 shrink-0">
                <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={R}
                    fill="none"
                    strokeWidth="8"
                    className="stroke-muted"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={R}
                    fill="none"
                    strokeWidth="8"
                    strokeLinecap="round"
                    className="stroke-primary transition-all duration-700 ease-smooth"
                    style={{ strokeDasharray: C, strokeDashoffset: dashOffset }}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  <span className="text-lg font-semibold tabular-nums">
                    {progressPct}%
                  </span>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Target className="h-4 w-4 text-primary" />
                  {t('dailyGoal')}
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tabular-nums">
                    {todayDone}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    / {dailyTotal}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {goalReached ? t('goalReached') : t('keepGoing')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Streak */}
          <Card>
            <CardContent className="flex h-full flex-col justify-between p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {t('streak')}
                </span>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Flame className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tabular-nums">
                  {streak}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('streakWord', { count: streak })}
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Subjects */}
        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t('activeSubjects')}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => {
              const Icon = getSubjectIcon(s.icon);
              const ready = s.is_active && s.question_count > 0;
              return (
                <Card
                  key={s.id}
                  className={cnReady(ready)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      {ready ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" />
                          {tSubjects('startTopic')}
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                          {tSubjects('comingSoon')}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-4 text-base font-semibold">
                      {subjectName(s, locale as Locale)}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tSubjects('topicsCount', { count: s.topic_count })} ·{' '}
                      {tSubjects('questionsCount', { count: s.question_count })}
                    </p>

                    <div className="mt-5">
                      {ready ? (
                        <Button asChild variant="outline" className="w-full">
                          <Link href={{ pathname: '/subjects/[subject]', params: { subject: s.slug } }}>
                            {t('startPractice')}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      ) : (
                        <Button variant="outline" className="w-full" disabled>
                          {tSubjects('comingSoon')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function cnReady(ready: boolean) {
  return ready
    ? 'group transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
    : 'opacity-80';
}
