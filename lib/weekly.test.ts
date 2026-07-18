import { describe, expect, it } from 'vitest';
import {
  WEEKLY_BLUEPRINT,
  WEEKLY_BLOCK_MAX_SCORE,
  WEEKLY_PAIR_MAX_SCORE,
  isoWeekKey,
  isSameIsoWeek,
  nextIsoWeekMonday,
  pickFreshBalancedByTopic,
} from './weekly';

describe('WEEKLY_BLUEPRINT', () => {
  it('lands in the requested ~15-18 total-for-the-pair range', () => {
    const perSubject = WEEKLY_BLUEPRINT.reduce((sum, part) => sum + part.count, 0);
    expect(perSubject * 2).toBeGreaterThanOrEqual(15);
    expect(perSubject * 2).toBeLessThanOrEqual(18);
  });

  it('derives block/pair max score from the blueprint', () => {
    const expectedBlock = WEEKLY_BLUEPRINT.reduce((sum, p) => sum + p.count * p.points, 0);
    expect(WEEKLY_BLOCK_MAX_SCORE).toBe(expectedBlock);
    expect(WEEKLY_PAIR_MAX_SCORE).toBe(2 * expectedBlock);
  });
});

describe('isoWeekKey', () => {
  // Reference values from the ISO-8601 week date spec (Wikipedia's worked examples).
  it('2005-01-01 (Sat) is week 53 of 2004', () => {
    expect(isoWeekKey(new Date(Date.UTC(2005, 0, 1)))).toBe('2004-W53');
  });

  it('2005-12-31 (Sat) is week 52 of 2005', () => {
    expect(isoWeekKey(new Date(Date.UTC(2005, 11, 31)))).toBe('2005-W52');
  });

  it('2007-01-01 (Mon) is week 1 of 2007', () => {
    expect(isoWeekKey(new Date(Date.UTC(2007, 0, 1)))).toBe('2007-W01');
  });

  it('2010-01-01 (Fri) is week 53 of 2009', () => {
    expect(isoWeekKey(new Date(Date.UTC(2010, 0, 1)))).toBe('2009-W53');
  });

  it('2024-12-30 (Mon) belongs to 2025-W01', () => {
    expect(isoWeekKey(new Date(Date.UTC(2024, 11, 30)))).toBe('2025-W01');
  });

  it('every day within the same Mon-Sun span maps to the same key', () => {
    const monday = isoWeekKey(new Date(Date.UTC(2026, 6, 13))); // Monday
    const sunday = isoWeekKey(new Date(Date.UTC(2026, 6, 19))); // Sunday
    expect(sunday).toBe(monday);
  });

  it('is computed from the UTC calendar date, not the process\'s local timezone', () => {
    // Regression: a naive `new Date(date.getFullYear(), date.getMonth(), date.getDate())`
    // reads LOCAL components, which in any positive-offset timezone (e.g. UTC+5) rolls a
    // late-UTC Sunday forward into local Monday — silently bumping it into the next ISO
    // week. This must stay pinned to the UTC calendar date regardless of where the code runs.
    const sundayLateUtc = new Date('2026-07-19T23:00:00.000Z'); // Sunday, still July 19 in UTC
    const mondaySameWeek = new Date('2026-07-13T00:00:00.000Z'); // Monday of the same week
    const mondayNextWeek = new Date('2026-07-20T00:00:00.000Z'); // Monday of the NEXT week

    expect(isoWeekKey(sundayLateUtc)).toBe(isoWeekKey(mondaySameWeek));
    expect(isoWeekKey(sundayLateUtc)).not.toBe(isoWeekKey(mondayNextWeek));
  });
});

describe('isSameIsoWeek', () => {
  it('true for two dates in the same ISO week', () => {
    const mon = new Date(Date.UTC(2026, 6, 13));
    const wed = new Date(Date.UTC(2026, 6, 15));
    expect(isSameIsoWeek(mon, wed)).toBe(true);
  });

  it('false across a week boundary', () => {
    const sun = new Date(Date.UTC(2026, 6, 19));
    const mon = new Date(Date.UTC(2026, 6, 20));
    expect(isSameIsoWeek(sun, mon)).toBe(false);
  });
});

describe('nextIsoWeekMonday', () => {
  it('returns a Monday strictly after the input, one week past the input\'s own Monday', () => {
    const wed = new Date(Date.UTC(2026, 6, 15)); // Wednesday
    const next = nextIsoWeekMonday(wed);
    expect(next.getUTCDay()).toBe(1); // Monday
    expect(next.getTime()).toBeGreaterThan(wed.getTime());
    expect(isSameIsoWeek(next, wed)).toBe(false);
    // Exactly the Monday of the week after wed's week.
    expect(next.getTime()).toBe(Date.UTC(2026, 6, 20));
  });

  it('from a Monday, jumps a full week ahead (not the same day)', () => {
    const mon = new Date(Date.UTC(2026, 6, 13));
    const next = nextIsoWeekMonday(mon);
    expect(next.getTime()).toBe(Date.UTC(2026, 6, 20));
  });

  it('is computed from the UTC calendar date, not the process\'s local timezone', () => {
    const sundayLateUtc = new Date('2026-07-19T23:00:00.000Z'); // still Sunday July 19 in UTC
    const next = nextIsoWeekMonday(sundayLateUtc);
    expect(next.getTime()).toBe(Date.UTC(2026, 6, 20)); // Monday July 20, not July 27
  });
});

type Q = { id: string; type: 'single' | 'multi' | 'matching'; topic_id: string };

const BP: ReadonlyArray<{ type: Q['type']; count: number; points: number }> = [
  { type: 'single', count: 2, points: 1 },
];

function q(id: string, topic: string, type: Q['type'] = 'single'): Q {
  return { id, type, topic_id: topic };
}

describe('pickFreshBalancedByTopic', () => {
  it('picks only fresh (unseen) questions when there are enough', () => {
    const pool = [q('A', 'T1'), q('B', 'T1'), q('SEEN', 'T1')];
    const exclude = new Set(['SEEN']);

    const { picked, shortfall } = pickFreshBalancedByTopic(pool, exclude, BP);

    expect(shortfall).toEqual([]);
    expect(picked).toHaveLength(2);
    expect(picked.some((p) => p.id === 'SEEN')).toBe(false);
  });

  it('tops up from previously-seen questions only for the type that falls short', () => {
    // Only one fresh 'single' question available, blueprint needs 2.
    const pool = [q('FRESH', 'T1'), q('SEEN1', 'T1'), q('SEEN2', 'T1')];
    const exclude = new Set(['SEEN1', 'SEEN2']);

    const { picked, shortfall } = pickFreshBalancedByTopic(pool, exclude, BP);

    expect(picked).toHaveLength(2);
    expect(picked.some((p) => p.id === 'FRESH')).toBe(true);
    // Topped up with exactly one previously-seen question, no duplicates.
    const ids = picked.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(shortfall).toEqual([]);
  });

  it('reports a real shortfall only when even the full bank cannot cover the blueprint', () => {
    const pool = [q('ONLY', 'T1')];
    const exclude = new Set<string>();

    const { picked, shortfall } = pickFreshBalancedByTopic(pool, exclude, BP);

    expect(picked).toHaveLength(1);
    expect(shortfall).toEqual([{ type: 'single', available: 1, required: 2 }]);
  });

  it('never duplicates a question id across the fresh and top-up passes', () => {
    const pool = [q('FRESH', 'T1'), q('SEEN', 'T1')];
    const exclude = new Set(['SEEN']);

    const { picked } = pickFreshBalancedByTopic(pool, exclude, BP);
    const ids = picked.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
