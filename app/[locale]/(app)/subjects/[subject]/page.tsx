import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { ArrowRight } from 'lucide-react';
import {
  getSubjectBySlug,
  getTopicsForSubject,
  subjectName,
  topicName,
} from '@/lib/supabase/queries';
import type { Locale } from '@/types/db';

export default async function SubjectTopicsPage({
  params,
}: {
  params: Promise<{ locale: string; subject: string }>;
}) {
  const { locale, subject: subjectSlug } = await params;
  setRequestLocale(locale);

  const subject = await getSubjectBySlug(subjectSlug);
  if (!subject) notFound();

  const [t, tCommon, topics] = await Promise.all([
    getTranslations('subjects'),
    getTranslations('common'),
    getTopicsForSubject(subjectSlug),
  ]);

  return (
    <>
      <PageHeader
        title={subjectName(subject, locale as Locale)}
        subtitle={t('topicsSubtitle')}
      />

      <div className="p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => {
            const ready = topic.question_count > 0;
            const card = (
              <Card
                className={`h-full transition-colors ${
                  ready ? 'hover:border-primary/40' : 'opacity-60'
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      {topicName(topic, locale as Locale)}
                    </CardTitle>
                    {!ready ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {tCommon('comingSoon')}
                      </span>
                    ) : null}
                  </div>
                  <CardDescription>
                    {t('questionsCount', { count: topic.question_count })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {ready ? (
                    <div className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      {t('startTopic')}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );

            return ready ? (
              <Link
                key={topic.id}
                href={`/practice/topic/${topic.slug}` as never}
              >
                {card}
              </Link>
            ) : (
              <div key={topic.id}>{card}</div>
            );
          })}
        </div>
      </div>
    </>
  );
}
