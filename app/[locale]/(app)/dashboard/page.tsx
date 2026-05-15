import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { Link } from '@/i18n/routing';
import { ArrowRight, Flame } from 'lucide-react';
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
  const name = displayName(profile, locale as Locale);
  const streak = profile?.current_streak ?? 0;

  return (
    <>
      <PageHeader
        title={t('greeting', { name })}
        subtitle={t('subtitle')}
      />

      <div className="space-y-8 p-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('dailyGoal')}</CardTitle>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Flame className="h-4 w-4 text-primary" />
                {t('streakDays', { count: streak })}
              </span>
            </div>
            <CardDescription>
              {t('dailyGoalProgress', { done: todayDone, total: dailyTotal })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t('activeSubjects')}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => {
              const Icon = getSubjectIcon(s.icon);
              const ready = s.is_active && s.question_count > 0;
              return (
                <Card key={s.id} className="transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      {!ready ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {tSubjects('comingSoon')}
                        </span>
                      ) : null}
                    </div>
                    <CardTitle className="mt-3">{subjectName(s, locale as Locale)}</CardTitle>
                    <CardDescription>
                      {tSubjects('topicsCount', { count: s.topic_count })} ·{' '}
                      {tSubjects('questionsCount', { count: s.question_count })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {ready ? (
                      <Button asChild variant="outline" className="w-full">
                        <Link href={`/subjects/${s.slug}` as never}>
                          {t('startPractice')}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        {tSubjects('comingSoon')}
                      </Button>
                    )}
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
