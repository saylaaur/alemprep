import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, Flame } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/layout/PageHeader';
import { BookCatalog } from '@/components/library/BookCatalog';
import { Button } from '@/components/ui/button';
import { getLibrary } from '@/lib/supabase/queries/books';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function LibraryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tr, library] = await Promise.all([
    getTranslations('library'),
    getTranslations('review'),
    getLibrary(locale as Locale),
  ]);

  const books = library.flatMap((subject) =>
    subject.topics.flatMap((topic) => topic.books.filter((book) => book.hasContent).map((book) => ({
      slug: book.slug,
      name: book.name,
      state: book.state,
      subject: subject.slug,
      topic: topic.name,
    })))
  );
  const subjects = library
    .filter((subject) => books.some((book) => book.subject === subject.slug))
    .map(({ slug, name }) => ({ slug, name }));
  const dueCount = books.filter((book) => book.state === 'due').length;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {dueCount > 0 && (
          <section aria-labelledby="library-due" className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border bg-card/85 p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-streak/15 text-streak">
                <Flame className="size-5" aria-hidden />
              </span>
              <div>
                <h2 id="library-due" className="font-semibold">{t('dueTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('booksCount', { count: dueCount })}</p>
              </div>
            </div>
            <Button asChild className="min-h-11">
              <Link href="/review">{tr('start')}<ChevronRight className="size-4" aria-hidden /></Link>
            </Button>
          </section>
        )}
        <BookCatalog books={books} subjects={subjects} />
      </div>
    </>
  );
}
