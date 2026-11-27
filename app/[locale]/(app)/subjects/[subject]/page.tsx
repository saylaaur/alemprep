import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { ChevronRight } from 'lucide-react';
import {
  getSubjectBySlug,
  getTopicsForSubject,
  subjectName,
  topicName,
} from '@/lib/supabase/queries';
import { availableTopicsFirst, groupTopicsBySection } from '@/lib/topics';
import { cn } from '@/lib/utils';
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
    getTopicsForSubject(subjectSlug, locale as Locale),
  ]);

  const sections = availableTopicsFirst(groupTopicsBySection(topics));
  const availabilityText = await getTranslations('contentAvailability');

  return (
    <>
      <PageHeader
        className="max-w-6xl"
        title={subjectName(subject, locale as Locale)}
        subtitle={t('topicsSubtitle')}
      />

      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
        {topics.every((topic) => topic.question_count === 0) && (
          <p className="rounded-xl border bg-card/70 backdrop-blur-xl p-5 text-sm text-muted-foreground">{availabilityText('topicDescription')}</p>
        )}
        {sections.map((section) => (
          <section key={section.sectionNo ?? 'other'}>
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {sectionTitle(section, locale as Locale, t('otherTopics'))}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.topics.map((topic) => {
                const available = topic.question_count > 0;
                const card = (
                  <Card className={cn('h-full', available ? 'transition-colors group-hover:border-primary/50 group-hover:bg-card/90' : 'bg-card/50')}>
                    <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                      <div className="min-w-0 space-y-1.5">
                        <CardTitle className="text-base leading-snug">{topicName(topic, locale as Locale)}</CardTitle>
                        <CardDescription>
                          {available ? t('questionsCount', { count: topic.question_count }) : availabilityText('unavailableLabel')}
                        </CardDescription>
                      </div>
                      {available && <ChevronRight className="size-5 shrink-0 text-primary" aria-hidden />}
                    </CardHeader>
                  </Card>
                );
                return available ? (
                  <Link
                    key={topic.id}
                    href={{ pathname: '/practice/topic/[topic]', params: { topic: topic.slug } }}
                    className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {card}
                  </Link>
                ) : (
                  <div key={topic.id} aria-disabled="true">{card}</div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
