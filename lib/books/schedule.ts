/**
 * Интервальное повторение книг-конспектов.
 *
 * Книга приходит после урока. Дальше её нужно повторить через
 * 1, 3, 7, 10, 14, 30 и 60 дней — это промежутки МЕЖДУ повторениями:
 * получил → через 1 день → ещё через 3 → ещё через 7 → … → ещё через 60.
 * После седьмого успешного повторения книга считается выученной.
 *
 * Если на повторении вспомнил меньше половины — шаг назад на один интервал
 * (но не раньше первого). Повторить раньше срока можно, но это не двигает
 * график: засчитывается только повторение в день срока или позже.
 *
 * Все даты — строки YYYY-MM-DD в Asia/Almaty (см. lib/streak.ts).
 */

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 10, 14, 30, 60] as const;
/** Стадия = сколько повторений уже засчитано. MASTERED — все интервалы пройдены. */
export const MASTERED_STAGE = REVIEW_INTERVALS_DAYS.length;
/** Порог «вспомнил»: доля вспомненного не ниже половины. */
export const RECALL_PASS_RATIO = 0.5;

export type BookSchedule = {
  /** 0..MASTERED_STAGE */
  stage: number;
  /** Следующее повторение; null — книга выучена. */
  dueOn: string | null;
};

export type ReviewOutcome = BookSchedule & {
  /** Повторение сдвинуло график (было в срок или с опозданием). */
  counted: boolean;
  /** Вспомнил меньше половины. */
  lapse: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(date: string, days: number): string {
  if (!DATE_RE.test(date)) throw new Error(`invalid date: ${date}`);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Разница в днях b − a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** График сразу после получения книги. */
export function initialSchedule(receivedOn: string): BookSchedule {
  return { stage: 0, dueOn: addDays(receivedOn, REVIEW_INTERVALS_DAYS[0]) };
}

export function isDue(schedule: BookSchedule, today: string): boolean {
  return schedule.dueOn !== null && schedule.dueOn <= today;
}

/**
 * Применить повторение. `recalled` — доля вспомненного 0..1
 * (сейчас — самооценка ученика, потом — доля верных карточек).
 */
export function applyReview(schedule: BookSchedule, recalled: number, today: string): ReviewOutcome {
  if (!Number.isFinite(recalled) || recalled < 0 || recalled > 1) throw new Error('recalled must be within 0..1');
  const stage = Math.max(0, Math.min(MASTERED_STAGE, Math.trunc(schedule.stage)));
  const lapse = recalled < RECALL_PASS_RATIO;

  // Выученная книга или повторение раньше срока — график не меняется.
  if (schedule.dueOn === null || schedule.dueOn > today) {
    return { stage, dueOn: schedule.dueOn, counted: false, lapse };
  }

  if (lapse) {
    const back = Math.max(0, stage - 1);
    return { stage: back, dueOn: addDays(today, REVIEW_INTERVALS_DAYS[back]), counted: true, lapse };
  }

  const next = stage + 1;
  if (next >= MASTERED_STAGE) return { stage: MASTERED_STAGE, dueOn: null, counted: true, lapse };
  return { stage: next, dueOn: addDays(today, REVIEW_INTERVALS_DAYS[next]), counted: true, lapse };
}

/** Даты всех будущих повторений, если повторять ровно в срок и без ошибок. */
export function plannedReviewDates(schedule: BookSchedule): string[] {
  const dates: string[] = [];
  let s = schedule;
  while (s.dueOn !== null) {
    dates.push(s.dueOn);
    s = applyReview(s, 1, s.dueOn);
  }
  return dates;
}
