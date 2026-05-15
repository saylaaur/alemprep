import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PracticeView } from '@/components/practice/PracticeView';
import { getQuestionsForTopic, topicName } from '@/lib/supabase/queries';
import type { Locale, Question, ContextContent } from '@/types/db';

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

  const typedContexts = new Map<string, { id: string; title: string | null; content: ContextContent }>(
    Array.from(contexts.entries()).map(([id, c]) => [
      id,
      { ...c, content: c.content as ContextContent },
    ])
  );

  return (
    <PracticeView
      questions={questions as unknown as Question[]}
      contexts={typedContexts}
      topicName={topicName(topic, locale as Locale)}
    />
  );
}
