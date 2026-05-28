import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PracticeView } from '@/components/practice/PracticeView';
import { getQuestionsForTopic, topicName } from '@/lib/supabase/queries';
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

  return (
    <PracticeView
      questions={questions}
      contexts={contexts}
      topicName={topicName(topic, locale as Locale)}
    />
  );
}
