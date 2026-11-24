import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReviewQueue, type QueueItem, type ReviewQueueLabels } from '@/components/review/ReviewQueue';
import { cardsOf } from '@/lib/cards/registry';
import { getCardLabels } from '@/lib/cards/labels';
import { getProfile } from '@/lib/supabase/queries';
import { getBookReviewsToday } from '@/lib/supabase/queries/books';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const profile = await getProfile();
  const [t, tl, reviews] = await Promise.all([
    getTranslations('review'),
    getTranslations('library'),
    profile ? getBookReviewsToday(profile.id, l) : Promise.resolve({ due: [], reviewedToday: 0 }),
  ]);

  const decks = reviews.due.map((b) => ({ b, deck: cardsOf(b.slug, l) }));
  const items: QueueItem[] = decks.map(({ b, deck }) => ({
    slug: b.slug,
    name: b.name,
    subjectName: b.subjectName,
    stage: b.stage,
    dueText: b.overdueDays > 0 ? tl('dueOverdue', { days: b.overdueDays }) : tl('dueToday'),
    cards: deck ? deck.cards : null,
  }));
  const cardLabels = await getCardLabels(decks.some(({ deck }) => deck?.fallback));

  const labels: ReviewQueueLabels = {
    start: t('start'),
    resume: t('resume'),
    progress: t.raw('progress') as string,
    stage: t.raw('stage') as string,
    repeat: t('repeat'),
    openBook: t('openBook'),
    noCards: t('noCards'),
    allDone: t('allDone'),
    allDoneHint: t('allDoneHint'),
    toToday: t('toToday'),
    toLibrary: t('toLibrary'),
    empty: t('empty'),
    intervals: t('intervals'),
  };

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ReviewQueue items={items} dateLocale={l === 'kk' ? 'kk-KZ' : 'ru-RU'} labels={labels} cardLabels={cardLabels} />
      </div>
    </>
  );
}
