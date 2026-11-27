import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProblemCatalog } from '@/components/problems/ProblemCatalog';
import { LESSONS, resolveLesson } from '@/lib/lessons/catalog';
import { buildProblemFolders } from '@/lib/problems/folders';
import { bankCounts } from '@/lib/problems/bank';
import { getLibrary } from '@/lib/supabase/queries/books';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function ProblemsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  setRequestLocale(locale);
  const l = locale as Locale;
  const [t, library] = await Promise.all([getTranslations('problems'), getLibrary(l)]);
  const lessons = LESSONS.map((x) => resolveLesson(x, l)).map((x) => ({
    id: x.id,
    title: x.title,
    bookSlug: x.bookSlug,
    count: x.problems.length + x.mock.length,
  }));
  const folders = buildProblemFolders(library, lessons, bankCounts())
    .filter((subject) => subject.count > 0)
    .map((subject) => ({ ...subject, topics: subject.topics.filter((topic) => topic.count > 0) }));
  const total = folders.reduce((n, s) => n + s.count, 0);

  return (
    <>
      <PageHeader title={t('title')} subtitle={total > 0 ? t('subtitle', { count: total }) : undefined} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <ProblemCatalog subjects={folders} />
      </div>
    </>
  );
}
