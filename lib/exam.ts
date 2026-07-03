import type { QuestionType } from '@/types/db';

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

export const QUESTION_POINTS: Record<QuestionType, number> = Object.fromEntries(
  EXAM_BLUEPRINT.map((part) => [part.type, part.points])
) as Record<QuestionType, number>;

/** Нехватка задач какого-то типа в банке: available < required. */
export type ExamShortfall = {
  type: QuestionType;
  available: number;
  required: number;
};
