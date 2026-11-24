import { getTranslations } from 'next-intl/server';
import type { CardReviewLabels } from '@/components/cards/CardReview';

/** Подписи тренажёра карточек (общие для страницы книги и очереди повторения). */
export async function getCardLabels(fallback: boolean): Promise<CardReviewLabels> {
  const tc = await getTranslations('cards');
  return {
    flip: tc('flipCard'),
    answer: tc('answer'),
    flipHint: tc('flipHint'),
    art: tc('art'),
    exam: tc('exam'),
    start: tc('start'),
    startHint: tc.raw('startHint') as string,
    fallback: fallback ? tc('fallback') : null,
    close: tc('close'),
    progress: tc.raw('progress') as string,
    showAnswer: tc('showAnswer'),
    forgot: tc('forgot'),
    recalled: tc('recalled'),
    keys: tc('keys'),
    resultTitle: tc.raw('resultTitle') as string,
    saving: tc('saving'),
    savedCounted: tc.raw('savedCounted') as string,
    savedLapse: tc.raw('savedLapse') as string,
    savedEarly: tc.raw('savedEarly') as string,
    savedMastered: tc('savedMastered'),
    saveError: tc('saveError'),
    saveRetry: tc('saveRetry'),
    retryMissed: tc.raw('retryMissed') as string,
    trainingDone: tc('trainingDone'),
    allRecalled: tc('allRecalled'),
    next: tc('next'),
  };
}
