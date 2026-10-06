import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PracticeView } from '@/components/practice/PracticeView';
import { getQuestionsForTopic, getSubjectsWithCounts, getTopicsForSubject, topicName } from '@/lib/supabase/queries';
import { ContentUnavailable } from '@/components/content/ContentUnavailable';
import type { Locale } from '@/types/db';
import { isLearningEnabled } from '@/lib/learning/feature-flag';
import { getTopicMetadata } from '@/lib/supabase/queries/topic-metadata';
import { getActor } from '@/lib/server/actor';
import { LearningPracticeView } from '@/components/practice/LearningPracticeView';
import { redirect } from 'next/navigation';

export default async function PracticeTopicPage({
  params,
}: {
  params: Promise<{ locale: string; topic: string }>;
}) {
  const { locale, topic: topicSlug } = await params;
  setRequestLocale(locale);

  if (isLearningEnabled()) {
    if (locale !== 'ru' && locale !== 'kk') notFound();
    const actor = await getActor();
    if (!actor) redirect(`/${locale}/login`);
    const topic = await getTopicMetadata(topicSlug);
    if (!topic) notFound();
    return <LearningPracticeView key={`${actor.id}:${locale}:${topicSlug}`} owner={actor.id} locale={locale} topicSlug={topicSlug} topicName={topicName(topic, locale)} />;
  }

  const { topic, questions, contexts } = await getQuestionsForTopic(
    topicSlug,
    locale as Locale
  );
  if (!topic) notFound();

  if (questions.length === 0) {
    const subjects = await getSubjectsWithCounts(locale as Locale);
    const subject = subjects.find((item) => item.id === topic.subject_id);
    const topics = subject ? await getTopicsForSubject(subject.slug, locale as Locale) : [];
    return <ContentUnavailable suggestions={topics.filter((item) => item.question_count > 0).slice(0, 3).map((item) => ({ slug: item.slug, name: topicName(item, locale as Locale), count: item.question_count }))} />;
  }

  return (
    <PracticeView
      questions={questions}
      contexts={contexts}
      topicName={topicName(topic, locale as Locale)}
    />
  );
}
