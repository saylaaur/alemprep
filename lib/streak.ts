/**
 * Логика дневного стрика. Чистые функции — тестируются без БД.
 * Даты везде — строки YYYY-MM-DD в локальном времени сервера,
 * тот же базис, что у getTodayAttemptsCount (локальная полночь).
 */

/** YYYY-MM-DD в локальном времени (toISOString давал бы UTC-сдвиг). */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** День перед date (YYYY-MM-DD), без влияния таймзоны. */
export function previousDateStr(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Новое значение стрика после активности в день `today`.
 * Возвращает null, если обновлять нечего (уже активен сегодня).
 */
export function advanceStreak(input: {
  lastActiveDate: string | null;
  currentStreak: number;
  today: string;
}): { streak: number; lastActiveDate: string } | null {
  const { lastActiveDate, currentStreak, today } = input;
  if (lastActiveDate === today) return null;
  const streak = lastActiveDate === previousDateStr(today) ? currentStreak + 1 : 1;
  return { streak, lastActiveDate: today };
}
