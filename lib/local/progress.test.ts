import { describe, expect, it } from 'vitest';
import { emptyState, type LocalState } from './state';
import { localProgress } from './progress';

const today = '2026-11-18';
const earned = (s: LocalState) => localProgress(s, today).achievements.filter((a) => a.earned).map((a) => a.key);

describe('прогресс без базы', () => {
  it('на пустом состоянии всё по нулям и ничего не открыто', () => {
    const p = localProgress(emptyState(), today);
    expect(p).toMatchObject({ streak: 0, bestStreak: 0, activeDays: 0, booksReceived: 0, reviewsTotal: 0 });
    expect(earned(emptyState())).toEqual([]);
  });

  it('серия и достижения по активности', () => {
    const s: LocalState = {
      ...emptyState(),
      activity: [
        { date: '2026-11-16', problems: 2, lessons: 3, cards: 0 },
        { date: '2026-11-17', problems: 0, lessons: 1, cards: 0 },
        { date: '2026-11-18', problems: 5, lessons: 0, cards: 1 },
      ],
    };
    const p = localProgress(s, today);
    expect(p.streak).toBe(3);
    expect(p.activeDays).toBe(3);
    expect(p.daily).toContainEqual({ date: '2026-11-16', count: 5 });
    expect(earned(s)).toEqual(['first-step', 'streak-3', 'three-topics-day']);
  });

  it('книги: первая, книжный червь, выученная, первое повторение', () => {
    const book = (stage: number, reviewsCount: number) => ({ stage, dueOn: stage >= 7 ? null : '2026-11-20', receivedOn: '2026-11-10', reviewsCount, lapses: 0 });
    const s: LocalState = {
      ...emptyState(),
      books: { a: book(7, 7), b: book(1, 1), c: book(0, 0), d: book(0, 0), e: book(0, 0) },
    };
    const p = localProgress(s, today);
    expect(p).toMatchObject({ booksReceived: 5, booksMastered: 1, reviewsTotal: 8 });
    expect(earned(s)).toEqual(['first-book', 'book-worm', 'first-review', 'book-mastered']);
  });
});
