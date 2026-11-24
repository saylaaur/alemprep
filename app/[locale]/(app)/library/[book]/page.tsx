import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { BookReader } from '@/components/library/BookReader';
import { BookActions } from '@/components/library/BookActions';
import { CardReview } from '@/components/cards/CardReview';
import { getCardLabels } from '@/lib/cards/labels';
import { cardsOf } from '@/lib/cards/registry';
import { getBook } from '@/lib/supabase/queries/books';
import { MASTERED_STAGE, plannedReviewDates } from '@/lib/books/schedule';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function BookPage({ params }: { params: Promise<{ locale: string; book: string }> }) {
  const { locale, book: slug } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const [t, book] = await Promise.all([getTranslations('library'), getBook(slug, l)]);
  if (!book) notFound();
  const deck = cardsOf(slug, l);
  const dateLocale = l === 'kk' ? 'kk-KZ' : 'ru-RU';
  const cardLabels = await getCardLabels(!!deck?.fallback);
  const useCards = !!deck && (book.state === 'due' || book.state === 'scheduled' || book.state === 'mastered');

  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(l === 'kk' ? 'kk-KZ' : 'ru-RU', { day: 'numeric', month: 'long' });
  const plan = book.received && book.dueOn ? plannedReviewDates({ stage: book.stage, dueOn: book.dueOn }) : [];

  const cover = (
    <div className="flex h-full flex-col justify-between p-[clamp(16px,6%,44px)] text-[#f4f7f5]">
      <div className="text-[clamp(10px,1.1vw,13px)] font-semibold uppercase tracking-[0.1em] opacity-70">
        {book.subjectName} · {book.topicName}
      </div>
      <div className="font-serif text-[clamp(26px,4vw,52px)] font-semibold leading-[1.02] tracking-[-0.02em]">{book.name}</div>
      <div className="text-[clamp(11px,1.2vw,14px)] font-medium text-[#a6f4d0]">AlemPrep</div>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/library" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      <div>
        <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {book.subjectName} · {book.topicName}
        </div>
        <h1 className="mt-1 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{book.name}</h1>
      </div>

      {book.content ? (
        <>
          {book.contentFallback && <p className="rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">{t('kkFallback')}</p>}
          <BookReader
            content={book.content}
            cover={cover}
            labels={{ prev: t('prev'), next: t('next'), page: t.raw('page') as string }}
          />
        </>
      ) : (
        <p className="rounded-3xl border bg-card/70 backdrop-blur-xl p-6 text-muted-foreground">{t('notReady')}</p>
      )}

      {book.content && (
        <section className="grid gap-5 rounded-3xl border bg-card/70 backdrop-blur-xl p-5 shadow-sm md:grid-cols-[1.2fr_1fr]">
          {useCards && deck ? (
            <CardReview
              slug={book.slug}
              cards={deck.cards}
              title={book.name}
              kicker={book.topicName}
              due={book.state === 'due'}
              dateLocale={dateLocale}
              labels={cardLabels}
            />
          ) : (
          <BookActions
            slug={book.slug}
            state={book.state}
            labels={{
              receive: t('receive'),
              receiveHint: t('receiveHint'),
              reviewTitle: t('reviewTitle'),
              reviewHint: t('reviewHint'),
              reviewEarly: t('reviewEarly'),
              recallAll: t('recallAll'),
              recallMost: t('recallMost'),
              recallFew: t('recallFew'),
              saved: t('saved'),
              error: t('errorGeneric'),
            }}
          />
          )}
          {book.received && (
            <div className="text-sm">
              {book.state === 'mastered' ? (
                <p className="font-medium">{t('mastered')}</p>
              ) : (
                <>
                  <p className="font-medium">{t('stage', { stage: Math.min(book.stage + 1, MASTERED_STAGE) })}</p>
                  {book.dueOn && <p className="mt-1 text-muted-foreground">{t('nextReview', { date: fmt(book.dueOn) })}</p>}
                  {plan.length > 0 && (
                    <>
                      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t('plan')}</div>
                      <ol className="mt-2 flex flex-wrap gap-1.5">
                        {plan.map((d, i) => (
                          <li key={d} className={i === 0 ? 'rounded-full bg-streak px-2.5 py-1 text-xs font-semibold text-[#2b1100]' : 'rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground'}>
                            {fmt(d)}
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </>
              )}
              {book.receivedOn && <p className="mt-3 text-xs text-muted-foreground">{t('receivedOn', { date: fmt(book.receivedOn) })}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
