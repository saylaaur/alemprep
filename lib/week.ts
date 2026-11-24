import { addDays } from '@/lib/books/schedule';

/** Семь дат текущей недели, понедельник → воскресенье (даты YYYY-MM-DD, без таймзон). */
export function weekDates(today: string): string[] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 — воскресенье
  const sinceMonday = (dow + 6) % 7;
  const monday = addDays(today, -sinceMonday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
