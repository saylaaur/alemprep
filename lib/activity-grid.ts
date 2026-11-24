import { localDateStr } from '@/lib/streak';

export type ActivityCell = {
  date: string;
  count: number;
  /** Ячейка вне окна (до начала периода или в будущем) — рисуется пустой. */
  outside: boolean;
  isToday: boolean;
};

export type ActivityWeek = { monthStart: number | null; days: ActivityCell[] };

/**
 * Сетка активности как на GitHub: колонки — недели (пн…вс), строки — дни недели.
 * Окно — последние `days` дней, включая сегодня.
 */
export function buildActivityGrid(
  daily: ReadonlyArray<{ date: string; count: number }>,
  days = 60,
  now: Date = new Date()
): ActivityWeek[] {
  const byDate = new Map(daily.map((d) => [d.date, d.count]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));

  const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - mondayIndex(start));
  const gridEnd = new Date(today);
  gridEnd.setDate(today.getDate() + (6 - mondayIndex(today)));

  const weeks: ActivityWeek[] = [];
  let lastMonth = -1;
  for (const cursor = new Date(gridStart); cursor <= gridEnd; ) {
    const week: ActivityCell[] = [];
    let monthStart: number | null = null;
    for (let i = 0; i < 7; i++) {
      const date = localDateStr(cursor);
      const outside = cursor < start || cursor > today;
      if (!outside && cursor.getMonth() !== lastMonth) {
        monthStart = cursor.getMonth();
        lastMonth = cursor.getMonth();
      }
      week.push({ date, count: outside ? 0 : (byDate.get(date) ?? 0), outside, isToday: cursor.getTime() === today.getTime() });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ monthStart, days: week });
  }
  return weeks;
}

/** Уровень яркости ячейки 0..4 по числу решённых задач за день. */
export function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

/** Сводка для подписи под сеткой. */
export function activitySummary(weeks: readonly ActivityWeek[]) {
  const cells = weeks.flatMap((w) => w.days).filter((c) => !c.outside);
  let best = 0;
  let run = 0;
  for (const c of cells) {
    run = c.count > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { activeDays: cells.filter((c) => c.count > 0).length, totalDays: cells.length, bestRun: best };
}
