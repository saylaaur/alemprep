/**
 * Логика дневного стрика и заморозок (как в Duolingo). Чистые функции — тестируются без БД.
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

/** Максимум заморозок, которые можно накопить одновременно. */
export const MAX_STREAK_FREEZES = 3;
/** Раз в сколько дней серии начисляется +1 заморозка. */
const FREEZE_AWARD_INTERVAL_DAYS = 7;

/**
 * +1 заморозка за каждую пересечённую границу FREEZE_AWARD_INTERVAL_DAYS
 * (7, 14, 21…), с потолком MAX_STREAK_FREEZES. Не начисляет при сбросе серии
 * (newStreak < previousStreak, floor только убывает или остаётся).
 */
function awardStreakFreezes(previousStreak: number, newStreak: number, currentFreezes: number): number {
  const crossed =
    Math.floor(newStreak / FREEZE_AWARD_INTERVAL_DAYS) -
    Math.floor(previousStreak / FREEZE_AWARD_INTERVAL_DAYS);
  if (crossed <= 0) return currentFreezes;
  return Math.min(currentFreezes + crossed, MAX_STREAK_FREEZES);
}

export type AdvanceStreakResult = {
  streak: number;
  lastActiveDate: string;
  streakFreezes: number;
  /** true, если пропущенный день закрыт заморозкой — UI показывает метку «заморозка спасла серию». */
  freezeUsed: boolean;
};

/**
 * Новое значение стрика после активности в день `today`.
 * Возвращает null, если обновлять нечего (уже активен сегодня).
 *
 * Заморозка: если пропущен РОВНО один день (lastActiveDate = позавчера) и
 * streakFreezes > 0 — тратим 1 заморозку, серия продолжает расти как обычно
 * (N → N+1), как будто пропущенного дня не было. Пропуск двух и более дней
 * заморозку не спасает — обычный сброс в 1, заморозка не тратится.
 */
export function advanceStreak(input: {
  lastActiveDate: string | null;
  currentStreak: number;
  today: string;
  streakFreezes: number;
}): AdvanceStreakResult | null {
  const { lastActiveDate, currentStreak, today, streakFreezes } = input;

  if (lastActiveDate === today) {
    // Активность сегодня уже учтена — но если currentStreak каким-то
    // образом оказался 0 при уже проставленной сегодняшней дате (аномалия
    // данных), самоисправляем в 1 вместо того, чтобы застрять на 0 до
    // следующего дня: null здесь означал бы «обновлять нечего», хотя есть что.
    if (currentStreak >= 1) return null;
    return { streak: 1, lastActiveDate: today, streakFreezes, freezeUsed: false };
  }

  const yesterday = previousDateStr(today);
  if (lastActiveDate === yesterday) {
    const streak = currentStreak + 1;
    return {
      streak,
      lastActiveDate: today,
      streakFreezes: awardStreakFreezes(currentStreak, streak, streakFreezes),
      freezeUsed: false,
    };
  }

  const dayBeforeYesterday = previousDateStr(yesterday);
  if (lastActiveDate === dayBeforeYesterday && streakFreezes > 0) {
    const streak = currentStreak + 1;
    const freezesAfterUse = streakFreezes - 1;
    return {
      streak,
      lastActiveDate: today,
      streakFreezes: awardStreakFreezes(currentStreak, streak, freezesAfterUse),
      freezeUsed: true,
    };
  }

  return { streak: 1, lastActiveDate: today, streakFreezes, freezeUsed: false };
}
