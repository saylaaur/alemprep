import { MASTERED_STAGE } from '@/lib/books/schedule';
import { activeDates, bestStreakOf, streakOf } from './activity';
import { ACTIVITY_DAYS, type LocalState } from './state';

/** Достижения локального режима: считаются по cookie (уроки, книги, повторения, серия). */
export const LOCAL_ACHIEVEMENT_KEYS = [
  'first-step',
  'streak-3',
  'streak-7',
  'three-topics-day',
  'first-book',
  'book-worm',
  'first-review',
  'book-mastered',
] as const;
export type LocalAchievementKey = (typeof LOCAL_ACHIEVEMENT_KEYS)[number];

/** Сколько книг нужно собрать для «Книжного червя». */
export const BOOK_WORM_TARGET = 5;
/** Сколько уроков за день дают «3 темы за день». */
export const TOPICS_IN_DAY_TARGET = 3;

export type LocalProgress = {
  streak: number;
  bestStreak: number;
  activeDays: number;
  windowDays: number;
  /** Сколько действий за день (задачи + уроки + повторения), для сетки активности. */
  daily: Array<{ date: string; count: number }>;
  booksReceived: number;
  booksMastered: number;
  reviewsTotal: number;
  achievements: Array<{ key: LocalAchievementKey; earned: boolean }>;
};

export function localProgress(state: LocalState, today: string): LocalProgress {
  const dates = activeDates(state);
  const books = Object.values(state.books);
  const booksReceived = books.length;
  const booksMastered = books.filter((b) => b.stage >= MASTERED_STAGE).length;
  const reviewsTotal = books.reduce((n, b) => n + b.reviewsCount, 0);
  const streak = streakOf(dates, today);
  const bestStreak = bestStreakOf(state, today);
  const bestDayLessons = state.activity.reduce((m, d) => Math.max(m, d.lessons), 0);

  const earned: Record<LocalAchievementKey, boolean> = {
    'first-step': dates.length > 0,
    'streak-3': bestStreak >= 3,
    'streak-7': bestStreak >= 7,
    'three-topics-day': bestDayLessons >= TOPICS_IN_DAY_TARGET,
    'first-book': booksReceived >= 1,
    'book-worm': booksReceived >= BOOK_WORM_TARGET,
    'first-review': reviewsTotal >= 1,
    'book-mastered': booksMastered >= 1,
  };

  return {
    streak,
    bestStreak,
    activeDays: dates.length,
    windowDays: ACTIVITY_DAYS,
    daily: state.activity.map((d) => ({ date: d.date, count: d.problems + d.lessons + d.cards })),
    booksReceived,
    booksMastered,
    reviewsTotal,
    achievements: LOCAL_ACHIEVEMENT_KEYS.map((key) => ({ key, earned: earned[key] })),
  };
}
