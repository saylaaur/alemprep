import { addDays } from '@/lib/books/schedule';
import { ACTIVITY_DAYS, type DayActivity, type LocalState } from './state';

/** Сколько уроков в день считаем целью для кольца «Уроки». */
export const DAILY_LESSON_GOAL = 1;

export type ActivityDelta = { problems?: number; lessons?: number; cards?: number };

const isActive = (d: DayActivity) => d.problems + d.lessons + d.cards > 0;

/** Даты, в которые что-то было сделано. */
export function activeDates(state: LocalState): string[] {
  return state.activity.filter(isActive).map((d) => d.date);
}

/**
 * Серия: подряд идущие дни с активностью. Если сегодня ещё ничего не сделано,
 * серия не рвётся — считаем от вчера (у ученика ещё есть время до конца дня).
 */
export function streakOf(dates: readonly string[], today: string): number {
  const set = new Set(dates);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function activityOn(state: LocalState, date: string): DayActivity {
  return state.activity.find((d) => d.date === date) ?? { date, problems: 0, lessons: 0, cards: 0 };
}

/** Записать сделанное за день. Чистая функция: возвращает новое состояние. */
export function recordActivity(state: LocalState, today: string, delta: ActivityDelta): LocalState {
  const cur = activityOn(state, today);
  const next: DayActivity = {
    date: today,
    problems: cur.problems + Math.max(0, delta.problems ?? 0),
    lessons: cur.lessons + Math.max(0, delta.lessons ?? 0),
    cards: cur.cards + Math.max(0, delta.cards ?? 0),
  };
  const oldest = addDays(today, -(ACTIVITY_DAYS - 1));
  const activity = [...state.activity.filter((d) => d.date !== today && d.date >= oldest), next].sort((a, b) => a.date.localeCompare(b.date));
  const updated: LocalState = { ...state, activity };
  const current = streakOf(activeDates(updated), today);
  return { ...updated, bestStreak: Math.max(state.bestStreak, current) };
}

/** Рекорд серии: лучшее из сохранённого и текущего. */
export function bestStreakOf(state: LocalState, today: string): number {
  return Math.max(state.bestStreak, streakOf(activeDates(state), today));
}
