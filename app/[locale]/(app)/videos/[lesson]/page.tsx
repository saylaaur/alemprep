import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BookOpen, ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { LessonWatch } from '@/components/lessons/LessonWatch';
import { getLesson, resolveLesson } from '@/lib/lessons/catalog';
import { buildLessonLabels } from '@/lib/lessons/labels';
import { receiveBookAction } from '@/lib/supabase/book-actions';
import { getBook } from '@/lib/supabase/queries/books';
import { isLocalMode } from '@/lib/data-mode';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function LessonPage({ params }: { params: Promise<{ locale: string; lesson: string }> }) {
  const { locale, lesson: id } = await params;
  setRequestLocale(locale);
  const data = getLesson(id);
  if (!data) notFound();
  const l = locale as Locale;
  const [t, book] = await Promise.all([getTranslations('lessons'), getBook(data.bookSlug, l)]);
  const lesson = resolveLesson(data, l);
  const labels = buildLessonLabels((key) => t.raw(key) as string);

  return (
    <LessonWatch
      lesson={lesson}
      subtitle={t(`subject.${lesson.subject}`)}
      book={book?.content ?? null}
      bookTitle={book?.name ?? lesson.title}
      labels={labels}
      dateLocale={l === 'kk' ? 'kk-KZ' : 'ru-RU'}
      activityUrl={isLocalMode() ? '/api/local/activity' : undefined}
      giftBook={book?.content ? receiveBookAction.bind(null, data.bookSlug) : undefined}
      backSlot={
        <Link href="/videos" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          {t('back')}
        </Link>
      }
      bookAction={
        book?.content ? (
          <Link
            href={{ pathname: '/library/[book]', params: { book: data.bookSlug } }}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-[transform,opacity] duration-150 ease-apple hover:opacity-90 active:scale-[0.97]"
          >
            <BookOpen className="h-4 w-4" />
            {t('openBook')}
          </Link>
        ) : null
      }
    />
  );
}
