import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, Flame } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PageHeader } from '@/components/layout/PageHeader';
import { BookRings, type Ring } from '@/components/library/BookRing';
import { getProfile } from '@/lib/supabase/queries';
import { getBookReviewsToday, getLibrary, type BookState } from '@/lib/supabase/queries/books';
import { cn } from '@/lib/utils';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

const STATE_STYLE: Record<BookState, string> = {
  // Книга ждёт повторения — цвет огня, как у серии.
  due: 'bg-streak text-[#2b1100]',
  // Ещё в графике повторений — жёлтый, как свечение книги на кольце.
  scheduled: 'bg-[#ffd45a]/20 text-[#8a6a00] dark:text-[#ffd45a]',
  mastered: 'bg-foreground text-background',
  available: 'bg-muted text-foreground',
  'not-ready': 'bg-muted/60 text-muted-foreground',
  locked: 'bg-muted/60 text-muted-foreground',
};

export default async function LibraryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const profile = await getProfile();
  const [t, tr, library, reviews] = await Promise.all([
    getTranslations('library'),
    getTranslations('review'),
    getLibrary(l),
    profile ? getBookReviewsToday(profile.id, l) : Promise.resolve({ due: [], reviewedToday: 0 }),
  ]);

  const ringBooks = library.flatMap((s) => s.topics.flatMap((tp) => tp.books.map((b) => ({ slug: b.slug, name: b.name, subject: s.slug, state: b.state }))));
  const mine = ringBooks.filter((b) => b.state === 'due' || b.state === 'scheduled' || b.state === 'mastered').length;
  // Отдельное кольцо на каждый предмет; выученные книги (прошли весь график 1-3-7-10-14-30-60) — в своём кольце.
  const rings: Ring[] = [
    ...library.map((s) => ({
      key: s.slug,
      name: s.name,
      books: ringBooks.filter((b) => b.subject === s.slug && b.state !== 'mastered'),
      empty: t('ringEmpty'),
    })),
    { key: 'learned', name: t('ringLearned'), books: ringBooks.filter((b) => b.state === 'mastered'), empty: t('ringLearnedEmpty') },
  ];

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="space-y-8 pb-8">
        <BookRings rings={rings} hint={t('ringHint')} />

        <div className="mx-auto max-w-5xl space-y-8 px-4 sm:px-6 lg:px-8">
          <section className="rounded-3xl border bg-card/70 backdrop-blur-xl p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                {reviews.due.length > 0 && <Flame className="h-5 w-5 fill-streak text-streak" aria-hidden />}
                {t('dueTitle')}
              </h2>
              {reviews.due.length > 0 && (
                <Link
                  href="/review"
                  className="rounded-full bg-streak px-4 py-1.5 text-sm font-semibold text-[#2b1100] transition-[transform,filter] duration-150 ease-apple hover:brightness-105 active:scale-[0.97]"
                >
                  {tr('start')}
                </Link>
              )}
            </div>
            {reviews.due.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dueEmpty')}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {reviews.due.map((b) => (
                  <li key={b.slug}>
                    <Link
                      href={{ pathname: '/library/[book]', params: { book: b.slug } }}
                      className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3 transition-[background-color,transform] duration-150 ease-apple hover:bg-muted active:scale-[0.985]"
                    >
                      <span className="h-12 w-9 shrink-0 rounded-[3px_7px_7px_3px] bg-streak shadow-[0_0_0_2px_hsl(var(--streak)/0.4),0_0_14px_hsl(var(--streak)/0.45)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{b.name}</span>
                        <span className="block text-[13px] text-muted-foreground">
                          {b.subjectName} · {b.overdueDays > 0 ? t('dueOverdue', { days: b.overdueDays }) : t('dueToday')}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {library.map((subject) => {
            const count = subject.topics.reduce((n, tp) => n + tp.books.length, 0);
            const own = subject.topics.reduce((n, tp) => n + tp.books.filter((b) => b.received).length, 0);
            return (
              <section key={subject.slug} id={subject.slug} className="scroll-mt-24">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-2xl font-bold tracking-tight">{subject.name}</h2>
                  <span className="text-sm text-muted-foreground">
                    {t('booksCount', { count })} · {t('mineCount', { count: own })}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {subject.topics.map((topic) => (
                    <div key={topic.slug} className="rounded-3xl border bg-card/70 backdrop-blur-xl p-4 shadow-sm">
                      <h3 className="mb-2 text-sm font-semibold leading-snug text-muted-foreground">
                        {topic.topicNo ? `${topic.topicNo}. ` : ''}
                        {topic.name}
                      </h3>
                      <ul className="grid gap-1">
                        {topic.books.map((b) => (
                          <li key={b.slug}>
                            <Link
                              href={{ pathname: '/library/[book]', params: { book: b.slug } }}
                              className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted"
                            >
                              <span className="min-w-0">{b.name}</span>
                              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', STATE_STYLE[b.state])}>
                                {t(`state.${b.state}`)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <p className="text-center text-xs text-muted-foreground">{t('mineCount', { count: mine })}</p>
        </div>
      </div>
    </>
  );
}
