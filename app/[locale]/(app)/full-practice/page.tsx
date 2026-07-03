import { setRequestLocale } from 'next-intl/server';
import { getMockExamQuestions } from '@/lib/supabase/queries';
import { MockExamView } from '@/components/practice/MockExamView';
import type { Locale } from '@/types/db';

export default async function FullPracticePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { questions, contexts, topics, subjectId, shortfall } = await getMockExamQuestions(locale as Locale);

  return (
    <MockExamView
      questions={questions}
      contexts={contexts}
      topics={topics}
      subjectId={subjectId ?? ''}
      locale={locale}
      shortfall={shortfall}
    />
  );
}
