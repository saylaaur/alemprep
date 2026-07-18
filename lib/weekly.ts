/**
 * Еженедельный тест: блюпринт, ISO-неделя как единый базис доступности,
 * и отбор задач с предпочтением свежих (не виденных ранее) вопросов.
 * Чистые функции — тестируются без БД (см. lib/weekly.test.ts).
 */
import type { QuestionType } from '@/types/db';
import { pickBalancedByTopic, type ExamShortfall } from '@/lib/exam';

/**
 * Блюпринт еженедельного теста: как DIAGNOSTIC_BLUEPRINT (9 заданий/предмет,
 * 18/пару) — постоянная сложность, та же пропорция типов, что у EXAM/DIAGNOSTIC.
 * В отличие от диагностики (замер один раз), это тест на регулярной основе —
 * сложность НЕ растёт со временем, чтобы рост балла отражал реальный прогресс.
 */
export const WEEKLY_BLUEPRINT: ReadonlyArray<{
  type: QuestionType;
  count: number;
  points: number;
}> = [
  { type: 'single', count: 6, points: 1 },
  { type: 'multi', count: 2, points: 2 },
  { type: 'matching', count: 1, points: 2 },
];

export const WEEKLY_BLOCK_MAX_SCORE = WEEKLY_BLUEPRINT.reduce(
  (sum, part) => sum + part.count * part.points,
  0
);
export const WEEKLY_PAIR_MAX_SCORE = 2 * WEEKLY_BLOCK_MAX_SCORE;

/** Части ISO-8601 недели (год недели + номер), в UTC — без сдвига таймзоной. */
function isoWeekParts(date: Date): { isoYear: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Пн=0 … Вс=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // четверг той же недели — определяет ISO-год
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const diffDays = Math.round((d.getTime() - week1Monday.getTime()) / 86_400_000);
  const week = Math.floor(diffDays / 7) + 1;
  return { isoYear, week };
}

/** ISO-8601 неделя как 'YYYY-Www' (понедельник — начало недели). */
export function isoWeekKey(date: Date): string {
  const { isoYear, week } = isoWeekParts(date);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** true, если a и b попадают в одну и ту же ISO-неделю. */
export function isSameIsoWeek(a: Date, b: Date): boolean {
  return isoWeekKey(a) === isoWeekKey(b);
}

/** Начало (понедельник, 00:00 UTC) ISO-недели, СЛЕДУЮЩЕЙ за неделей date. */
export function nextIsoWeekMonday(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Пн=0 … Вс=6
  d.setUTCDate(d.getUTCDate() - dayNum + 7);
  return d;
}

/**
 * Как pickBalancedByTopic, но предпочитает вопросы, которых пользователь ещё
 * не видел (excludeIds): сначала набираем блюпринт из свежего пула, и только
 * для типов, где свежих не хватило, добираем из уже виденных (без повторного
 * выбора одного и того же id). Реальный shortfall — только если не хватает
 * даже с учётом виденных вопросов (см. docs/weekly-tests-design.md: «при
 * тонком банке возможны повторы — не блокер»).
 */
export function pickFreshBalancedByTopic<
  T extends { id: string; type: QuestionType; topic_id: string },
>(
  pool: readonly T[],
  excludeIds: ReadonlySet<string>,
  blueprint: typeof WEEKLY_BLUEPRINT = WEEKLY_BLUEPRINT
): { picked: T[]; shortfall: ExamShortfall[] } {
  const fresh = pool.filter((q) => !excludeIds.has(q.id));
  const { picked: freshPicked, shortfall: freshShortfall } = pickBalancedByTopic(fresh, blueprint);

  if (freshShortfall.length === 0) {
    return { picked: freshPicked, shortfall: [] };
  }

  const pickedIds = new Set(freshPicked.map((q) => q.id));
  const remainingPool = pool.filter((q) => !pickedIds.has(q.id));
  const topUpBlueprint = freshShortfall.map((s) => ({
    type: s.type,
    count: s.required - s.available,
    points: blueprint.find((b) => b.type === s.type)?.points ?? 0,
  }));
  const { picked: topUpPicked } = pickBalancedByTopic(remainingPool, topUpBlueprint);

  const picked = [...freshPicked, ...topUpPicked];

  // Итоговый shortfall считаем от блюпринта по фактически набранному
  // количеству каждого типа — не от промежуточных shortfall выше.
  const countByType = new Map<QuestionType, number>();
  for (const q of picked) countByType.set(q.type, (countByType.get(q.type) ?? 0) + 1);
  const shortfall: ExamShortfall[] = [];
  for (const part of blueprint) {
    const available = countByType.get(part.type) ?? 0;
    if (available < part.count) {
      shortfall.push({ type: part.type, available, required: part.count });
    }
  }

  return { picked, shortfall };
}
