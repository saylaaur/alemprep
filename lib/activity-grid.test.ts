import { describe, expect, it } from 'vitest';
import { activityLevel, activitySummary, buildActivityGrid } from './activity-grid';

const NOW = new Date('2026-11-16T10:00:00Z'); // пн, 16 ноября 2026

describe('buildActivityGrid', () => {
  it('covers exactly the last 60 days, weeks start on Monday', () => {
    const weeks = buildActivityGrid([], 60, NOW);
    const inside = weeks.flatMap((w) => w.days).filter((c) => !c.outside);
    expect(inside).toHaveLength(60);
    expect(inside[0].date).toBe('2026-09-18');
    expect(inside[59].date).toBe('2026-11-16');
    expect(inside[59].isToday).toBe(true);
    for (const w of weeks) expect(w.days).toHaveLength(7);
    expect(new Date(`${weeks[0].days[0].date}T12:00:00`).getDay()).toBe(1);
  });

  it('advances the activity window at midnight in Almaty', () => {
    const activity = [{ date: '2026-11-17', count: 2 }];
    const before = buildActivityGrid(activity, 60, new Date('2026-11-16T18:59:59Z'));
    const after = buildActivityGrid(activity, 60, new Date('2026-11-16T19:00:00Z'));
    expect(before.flatMap((week) => week.days).find((cell) => cell.isToday)?.date).toBe('2026-11-16');
    expect(after.flatMap((week) => week.days).find((cell) => cell.isToday)).toMatchObject({
      date: '2026-11-17', count: 2, outside: false,
    });
  });

  it('puts counts on the right days and marks month starts', () => {
    const weeks = buildActivityGrid([{ date: '2026-11-01', count: 4 }, { date: '2026-08-01', count: 9 }], 60, NOW);
    const cells = weeks.flatMap((w) => w.days);
    expect(cells.find((c) => c.date === '2026-11-01')?.count).toBe(4);
    expect(cells.some((c) => c.date === '2026-08-01')).toBe(false);
    expect(weeks.map((w) => w.monthStart).filter((m) => m !== null)).toEqual([8, 9, 10]);
  });
});

describe('activityLevel / activitySummary', () => {
  it('maps counts to 5 levels', () => {
    expect([0, 1, 3, 7, 25].map(activityLevel)).toEqual([0, 1, 2, 3, 4]);
  });

  it('counts active days and the best run', () => {
    const weeks = buildActivityGrid(
      [{ date: '2026-11-10', count: 1 }, { date: '2026-11-11', count: 2 }, { date: '2026-11-12', count: 3 }, { date: '2026-11-15', count: 1 }],
      60,
      NOW
    );
    expect(activitySummary(weeks)).toEqual({ activeDays: 4, totalDays: 60, bestRun: 3 });
  });
});
