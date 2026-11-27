import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    getSubjectsWithCounts(locale as Locale),
  ]);

  return (
    <>
      <PageHeader className="max-w-6xl" title={t('title')} subtitle={t('subtitle')} />

      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => {
            const Icon = getSubjectIcon(s.icon);
            return (
              <Link
                key={s.id}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={{ pathname: '/subjects/[subject]', params: { subject: s.slug } }}
              >
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <CardTitle className="mt-3">{subjectName(s, locale as Locale)}</CardTitle>
                    <CardDescription>
                      {t('topicsCount', { count: s.topic_count })} ·{' '}
                      {t('questionsCount', { count: s.question_count })}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
