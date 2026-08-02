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
import { groupTopicsBySection } from '@/lib/topics';
import type { Locale } from '@/types/db';

function sectionTitle(
  section: { sectionNameRu: string | null; sectionNameKk: string | null },
  locale: Locale,
  otherLabel: string,
): string {
  if (section.sectionNameRu === null) return otherLabel;
  return locale === 'kk' ? (section.sectionNameKk ?? section.sectionNameRu) : section.sectionNameRu;
}

export default async function SubjectTopicsPage({
  params,
}: {
  params: Promise<{ locale: string; subject: string }>;
}) {
  const { locale, subject: subjectSlug } = await params;
  setRequestLocale(locale);

  const subject = await getSubjectBySlug(subjectSlug);
  if (!subject) notFound();

  const [t, topics] = await Promise.all([
    getTranslations('subjects'),
    getTopicsForSubject(subjectSlug),
  ]);

  const sections = groupTopicsBySection(topics);

  return (
    <>
      <PageHeader
        title={subjectName(subject, locale as Locale)}
        subtitle={t('topicsSubtitle')}
      />

      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        {sections.map((section) => (
          <section key={section.sectionNo ?? 'other'}>
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {sectionTitle(section, locale as Locale, t('otherTopics'))}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.topics.map((topic) => (
                <Link
                  key={topic.id}
                  href={{ pathname: '/practice/topic/[topic]', params: { topic: topic.slug } }}
                >
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardHeader>
                      <CardTitle className="text-base">
                        {topicName(topic, locale as Locale)}
                      </CardTitle>
                      <CardDescription>
                        {t('questionsCount', { count: topic.question_count })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                        {t('startTopic')}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
