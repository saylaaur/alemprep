import type { QuestionType, QuestionBody } from '@/types/db';

/**
 * Формат профильного блока ЕНТ (математика): 40 заданий, 55 баллов, 80 минут.
 * Порядок частей фиксирован: single (1–25) → multi (26–35) → matching (36–40).
 */
export const EXAM_BLUEPRINT: ReadonlyArray<{
  type: QuestionType;
  count: number;
  points: number;
}> = [
  { type: 'single', count: 25, points: 1 },
  { type: 'multi', count: 10, points: 2 },
  { type: 'matching', count: 5, points: 2 },
];

export const EXAM_DURATION_S = 80 * 60;

export const EXAM_MAX_SCORE = EXAM_BLUEPRINT.reduce(
  (sum, part) => sum + part.count * part.points,
  0
);

/**
 * Пара профильных предметов: первый блок всегда математика,
 * второй — физика или информатика. Других пар в ЕНТ-профиле нет.
 * 2 блока × 40 заданий, 160 минут (пропорция ЕНТ: 80 заданий из 120 минут
 * на предмет → ×2), максимум 110 баллов.
 */
export const EXAM_FIRST_SUBJECT = 'math' as const;
export const EXAM_SECOND_SUBJECTS = ['physics', 'informatics'] as const;
export type ExamSecondSubject = (typeof EXAM_SECOND_SUBJECTS)[number];

export const EXAM_PAIR_DURATION_S = 160 * 60;
export const EXAM_PAIR_MAX_SCORE = 2 * EXAM_MAX_SCORE;

export const QUESTION_POINTS: Record<QuestionType, number> = Object.fromEntries(
  EXAM_BLUEPRINT.map((part) => [part.type, part.points])
) as Record<QuestionType, number>;

/** Нехватка задач какого-то типа в банке: available < required. */
export type ExamShortfall = {
  type: QuestionType;
  available: number;
  required: number;
};

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Отбор заданий блока по блюпринту, сбалансированно по темам:
 * внутри каждого типа — round-robin по перемешанным тематическим группам
 * (и перемешанным задачам внутри группы). Если задач не хватает —
 * берём сколько есть и фиксируем shortfall.
 * Порядок частей — как в блюпринте (single → multi → matching).
 */
export function pickBalancedByTopic<
  T extends { type: QuestionType; topic_id: string },
>(
  pool: readonly T[],
  blueprint: typeof EXAM_BLUEPRINT = EXAM_BLUEPRINT
): { picked: T[]; shortfall: ExamShortfall[] } {
  const picked: T[] = [];
  const shortfall: ExamShortfall[] = [];

  for (const part of blueprint) {
    const byTopic = new Map<string, T[]>();
    for (const q of pool) {
      if (q.type !== part.type) continue;
      const group = byTopic.get(q.topic_id);
      if (group) group.push(q);
      else byTopic.set(q.topic_id, [q]);
    }

    const groups = shuffle([...byTopic.values()].map((g) => shuffle(g)));
    const taken: T[] = [];
    for (let round = 0; taken.length < part.count; round++) {
      const before = taken.length;
      for (const group of groups) {
        if (taken.length >= part.count) break;
        if (round < group.length) taken.push(group[round]);
      }
      if (taken.length === before) break; // пул исчерпан
    }

    picked.push(...taken);
    if (taken.length < part.count) {
      shortfall.push({ type: part.type, available: taken.length, required: part.count });
    }
  }

  return { picked, shortfall };
}

/**
 * Балл за ответ по правилам ЕНТ.
 * single: 1 или 0. multi и matching допускают частичный балл:
 * 2 — без ошибок, 1 — ровно одна ошибка (пропуск/лишний вариант или одна
 * неверная пара), иначе 0. Пропущенный вопрос (answer == null) — всегда 0.
 */
export function scoreAnswer(type: QuestionType, body: QuestionBody, answer: unknown): number {
  if (answer === null || answer === undefined) return 0;

  if (type === 'single') {
    return 'correct' in body && typeof body.correct === 'string' && answer === body.correct ? 1 : 0;
  }

  if (type === 'multi') {
    if (!('correct' in body) || !Array.isArray(body.correct) || !Array.isArray(answer)) return 0;
    const chosen = new Set(answer.filter((x): x is string => typeof x === 'string'));
    // пустой выбор — это не «одна ошибка», а отсутствие ответа
    if (chosen.size === 0) return 0;
    const correct = new Set(body.correct);
    const missed = body.correct.filter((c) => !chosen.has(c)).length;
    const extra = [...chosen].filter((c) => !correct.has(c)).length;
    const errors = missed + extra;
    return errors === 0 ? 2 : errors === 1 ? 1 : 0;
  }

  if (type === 'matching') {
    if (!('correct' in body) || typeof body.correct !== 'object' || Array.isArray(body.correct)) return 0;
    if (typeof answer !== 'object' || Array.isArray(answer)) return 0;
    const given = answer as Record<string, unknown>;
    // ни одной заполненной пары — это отсутствие ответа, а не «одна ошибка»
    if (!Object.values(given).some((v) => typeof v === 'string' && v.length > 0)) return 0;
    const pairs = Object.entries(body.correct as Record<string, string>);
    const wrong = pairs.filter(([k, v]) => given[k] !== v).length;
    return wrong === 0 ? 2 : wrong === 1 ? 1 : 0;
  }

  return 0;
}
