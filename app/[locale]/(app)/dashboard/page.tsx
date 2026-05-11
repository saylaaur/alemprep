import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { Link } from '@/i18n/routing';
import { Calculator, Atom, Code2, ArrowRight, Flame } from 'lucide-react';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DashboardContent />;
}

function DashboardContent() {
  const t = useTranslations('dashboard');
  const tSubjects = useTranslations('subjects');

  // На Шаге 2 эти числа поедут из Supabase. Сейчас — статические заглушки.
  const dailyDone = 0;
  const dailyTotal = 20;
  const progressPct = Math.round((dailyDone / dailyTotal) * 100);

  const subjects = [
    {
      slug: 'math',
      name: tSubjects('math'),
      icon: Calculator,
      topics: 12,
      questions: 0,
      ready: true,
    },
    {
      slug: 'physics',
      name: tSubjects('physics'),
      icon: Atom,
      topics: 0,
      questions: 0,
      ready: false,
    },
    {
      slug: 'informatics',
      name: tSubjects('informatics'),
      icon: Code2,
      topics: 0,
      questions: 0,
      ready: false,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('greeting', { name: 'Zhangirkhan' })}
        subtitle={t('subtitle')}
      />

      <div className="space-y-8 p-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('dailyGoal')}</CardTitle>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Flame className="h-4 w-4 text-primary" />
                {t('streakDays', { count: 0 })}
              </span>
            </div>
            <CardDescription>
              {t('dailyGoalProgress', { done: dailyDone, total: dailyTotal })}
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
              const Icon = s.icon;
              return (
                <Card key={s.slug} className="transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      {!s.ready ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          скоро
                        </span>
                      ) : null}
                    </div>
                    <CardTitle className="mt-3">{s.name}</CardTitle>
                    <CardDescription>
                      {tSubjects('topicsCount', { count: s.topics })} ·{' '}
                      {tSubjects('questionsCount', { count: s.questions })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      asChild
                      variant="outline"
                      className="w-full"
                      disabled={!s.ready}
                    >
                      <Link href={s.ready ? '/subjects' : '/dashboard'}>
                        {t('startPractice')}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
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
