import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PracticeView } from '@/components/practice/PracticeView';
import { getQuestionsForTopic, getSubjectsWithCounts, getTopicsForSubject, topicName } from '@/lib/supabase/queries';
import { ContentUnavailable } from '@/components/content/ContentUnavailable';
import type { Locale } from '@/types/db';

export default async function PracticeTopicPage({
  params,
}: {
  params: Promise<{ locale: string; topic: string }>;
}) {
  const { locale, topic: topicSlug } = await params;
  setRequestLocale(locale);

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
