import { EXAM_PAIR_MAX_SCORE, DIAGNOSTIC_PAIR_MAX_SCORE } from '@/lib/exam';
import { localDateStr } from '@/lib/streak';

/** Дней до даты ЕНТ (может быть отрицательным, если дата в прошлом). */
export function daysUntilExam(examDate: string, today: string = localDateStr()): number {
  const target = new Date(`${examDate}T00:00:00Z`).getTime();
  const from = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((target - from) / 86_400_000);
}

/**
 * Прогноз балла по паре (0..EXAM_PAIR_MAX_SCORE) из результата диагностики:
 * линейная экстраполяция baseline (0..DIAGNOSTIC_PAIR_MAX_SCORE) на шкалу
 * пары. Грубая оценка для мотивации, не точный прогноз.
 */
export function projectedPairScore(diagnosticScore: number): number {
  const ratio = Math.max(0, Math.min(1, diagnosticScore / DIAGNOSTIC_PAIR_MAX_SCORE));
  return Math.round(ratio * EXAM_PAIR_MAX_SCORE);
}

export type BaselineTopicStat = {
  topicId: string;
  nameRu: string;
  nameKk: string;
  total: number;
  correct: number;
};

export type PriorityTopic = {
  topicId: string;
  nameRu: string;
  nameKk: string;
  accuracy: number;
};

/** До `limit` самых слабых тем диагностики (нужна хотя бы 1 попытка по теме). */
export function buildPriorityTopics(stats: readonly BaselineTopicStat[], limit = 4): PriorityTopic[] {
  return stats
    .filter((s) => s.total > 0)
    .map((s) => ({ topicId: s.topicId, nameRu: s.nameRu, nameKk: s.nameKk, accuracy: s.correct / s.total }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}
