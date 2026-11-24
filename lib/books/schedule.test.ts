import { describe, expect, it } from 'vitest';
import {
  MASTERED_STAGE,
  REVIEW_INTERVALS_DAYS,
  addDays,
  applyReview,
  daysBetween,
  initialSchedule,
  isDue,
  plannedReviewDates,
} from './schedule';

describe('book review schedule', () => {
  it('uses the 1-3-7-10-14-30-60 day gaps', () => {
    expect(REVIEW_INTERVALS_DAYS).toEqual([1, 3, 7, 10, 14, 30, 60]);
  });

  it('first review is the day after the book is received', () => {
    expect(initialSchedule('2026-11-16')).toEqual({ stage: 0, dueOn: '2026-11-17' });
  });

  it('plans all seven reviews when everything is remembered on time', () => {
    const dates = plannedReviewDates(initialSchedule('2026-11-16'));
    expect(dates).toEqual(['2026-11-17', '2026-11-20', '2026-11-27', '2026-12-07', '2026-12-21', '2027-01-20', '2027-03-21']);
    const gaps = dates.map((d, i) => daysBetween(i === 0 ? '2026-11-16' : dates[i - 1], d));
    expect(gaps).toEqual([1, 3, 7, 10, 14, 30, 60]);
  });

  it('a good review moves to the next gap, counted from the review day', () => {
    const r = applyReview({ stage: 2, dueOn: '2026-11-27' }, 0.8, '2026-11-29');
    expect(r).toEqual({ stage: 3, dueOn: '2026-12-09', counted: true, lapse: false });
  });

  it('remembering less than half steps back one gap, never below the first', () => {
    expect(applyReview({ stage: 3, dueOn: '2026-12-07' }, 0.4, '2026-12-07')).toEqual({
      stage: 2, dueOn: '2026-12-14', counted: true, lapse: true,
    });
    expect(applyReview({ stage: 0, dueOn: '2026-11-17' }, 0, '2026-11-17')).toEqual({
      stage: 0, dueOn: '2026-11-18', counted: true, lapse: true,
    });
  });

  it('exactly half counts as remembered', () => {
    expect(applyReview({ stage: 1, dueOn: '2026-11-20' }, 0.5, '2026-11-20').stage).toBe(2);
  });

  it('early reviews do not move the schedule', () => {
    expect(applyReview({ stage: 1, dueOn: '2026-11-20' }, 1, '2026-11-18')).toEqual({
      stage: 1, dueOn: '2026-11-20', counted: false, lapse: false,
    });
  });

  it('the last on-time review masters the book', () => {
    const r = applyReview({ stage: 6, dueOn: '2027-03-21' }, 1, '2027-03-21');
    expect(r).toEqual({ stage: MASTERED_STAGE, dueOn: null, counted: true, lapse: false });
    expect(isDue(r, '2030-01-01')).toBe(false);
  });

  it('isDue includes overdue books', () => {
    expect(isDue({ stage: 1, dueOn: '2026-11-20' }, '2026-11-19')).toBe(false);
    expect(isDue({ stage: 1, dueOn: '2026-11-20' }, '2026-11-20')).toBe(true);
    expect(isDue({ stage: 1, dueOn: '2026-11-20' }, '2026-11-25')).toBe(true);
  });

  it('rejects bad input', () => {
    expect(() => applyReview({ stage: 0, dueOn: '2026-11-17' }, 1.2, '2026-11-17')).toThrow();
    expect(() => applyReview({ stage: 0, dueOn: '2026-11-17' }, Number.NaN, '2026-11-17')).toThrow();
    expect(() => addDays('17.11.2026', 1)).toThrow();
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
