import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { getSubjectsWithCounts, subjectName } from '@/lib/supabase/queries';
import { getSubjectIcon } from '@/lib/icons';
import type { Locale } from '@/types/db';

export default async function SubjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, subjects] = await Promise.all([
    getTranslations('subjects'),
    getSubjectsWithCounts(),
  ]);

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => {
            const Icon = getSubjectIcon(s.icon);
            const ready = s.is_active && s.question_count > 0;
            const card = (
              <Card
                className={`h-full transition-colors ${
                  ready ? 'hover:border-primary/40' : 'opacity-60'
                }`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    {!ready ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t('comingSoon')}
                      </span>
                    ) : null}
                  </div>
                  <CardTitle className="mt-3">{subjectName(s, locale as Locale)}</CardTitle>
                  <CardDescription>
                    {t('topicsCount', { count: s.topic_count })} ·{' '}
                    {t('questionsCount', { count: s.question_count })}
                  </CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            );

            return ready ? (
              <Link key={s.id} href={{ pathname: '/subjects/[subject]', params: { subject: s.slug } }}>
                {card}
              </Link>
            ) : (
              <div key={s.id}>{card}</div>
            );
          })}
        </div>
      </div>
    </>
  );
}
