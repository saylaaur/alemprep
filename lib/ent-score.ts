import examFormat from '@/scripts/data/official-exam-format.json';

/**
 * Официальные пороги и минимумы НЦТ (scripts/data/official-exam-format.json —
 * testcenter.kz, «Формат тестирования» и «Предметы ЕНТ»). Значения — из JSON,
 * не хардкодятся: обновится спецификация — обновится JSON, а не код.
 */

export interface SubjectScore {
  slug: string;
  score: number;
  maxScore: number;
}

export interface EntProjection {
  /** Сумма набранных баллов по измеряемым платформой предметам (профильная пара). */
  measuredScore: number;
  /** Сумма максимумов измеряемых предметов (обычно 100 — 2×50). */
  measuredMax: number;
  /** Полная официальная шкала ЕНТ. */
  totalScale: number;
  /** Баллы обязательного блока (история + грамотность чтения + мат. грамотность),
   *  которые платформа пока не измеряет — НЕ прогнозируется, а честно показывается как пробел. */
  uncoveredMax: number;
}

/**
 * Прогноз общего балла из 140: не выдумывает результат по непокрытым
 * обязательным предметам — просто показывает измеренное на правильной шкале
 * с явной пометкой, сколько баллов ещё не покрыто платформой.
 */
export function entProjection(profileScores: SubjectScore[]): EntProjection {
  const measuredScore = profileScores.reduce((sum, s) => sum + s.score, 0);
  const measuredMax = profileScores.reduce((sum, s) => sum + s.maxScore, 0);
  const uncoveredMax = examFormat.mandatory.subjects.reduce((sum, s) => sum + s.max_score, 0);
  return {
    measuredScore,
    measuredMax,
    totalScale: examFormat.exam.max_score,
    uncoveredMax,
  };
}

const MANDATORY_MIN_BY_SLUG: Record<string, number> = Object.fromEntries(
  examFormat.mandatory.subjects.map((s) => [s.slug, s.min_score]),
);

/**
 * Минимум по предмету (official-exam-format.json:thresholds.per_subject_minimums).
 * Обязательные предметы (history-kz/reading-literacy/math-literacy) имеют свой
 * min_score; профильные (math/physics/informatics) — profile.min_score_per_subject.
 */
export function subjectMinimum(subjectSlug: string): number {
  return MANDATORY_MIN_BY_SLUG[subjectSlug] ?? examFormat.profile.min_score_per_subject;
}

/** Не набрал минимум хотя бы по одному предмету — не проходишь, каким бы ни был общий балл. */
export function meetsSubjectMinimum(subjectSlug: string, score: number): boolean {
  return score >= subjectMinimum(subjectSlug);
}

export const NATIONAL_UNIVERSITY_THRESHOLD = examFormat.thresholds.national_universities;
export const OTHER_UNIVERSITY_THRESHOLD = examFormat.thresholds.other_universities;

export interface ThresholdStatus {
  meetsTarget: boolean;
  /** target - total, не меньше 0. */
  gap: number;
}

export function thresholdStatus(total: number, target: number): ThresholdStatus {
  return { meetsTarget: total >= target, gap: Math.max(0, target - total) };
}
