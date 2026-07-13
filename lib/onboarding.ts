import { EXAM_SECOND_SUBJECTS, type ExamSecondSubject } from '@/lib/exam';
import { MIN_TARGET_SCORE, MAX_TARGET_SCORE } from '@/lib/settings';
import { localDateStr } from '@/lib/streak';

export type OnboardingInput = {
  secondSubject: string;
  examDate: string;
  targetScore: number;
};

export type OnboardingValues = {
  secondSubject: ExamSecondSubject;
  examDate: string;
  targetScore: number;
};

export type OnboardingValidation =
  | { ok: true; value: OnboardingValues }
  | { ok: false; error: 'invalid_subject' | 'invalid_exam_date' | 'invalid_target_score' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Дата ЕНТ должна быть валидной YYYY-MM-DD и не раньше сегодняшнего дня. */
export function validateExamDate(value: string, today: string = localDateStr()): string | null {
  if (!DATE_RE.test(value)) return null;
  if (Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) return null;
  if (value < today) return null;
  return value;
}

/** Клэмп целевого балла в [MIN_TARGET_SCORE, MAX_TARGET_SCORE] (шкала пары, UI-максимум 110). */
export function clampTargetScore(value: number): number {
  return Math.min(MAX_TARGET_SCORE, Math.max(MIN_TARGET_SCORE, Math.round(value)));
}

/**
 * Валидация онбординга: неизвестный предмет/дата в прошлом — отклоняются,
 * а целевой балл вне диапазона — клэмпится (не блокирует завершение).
 */
export function validateOnboarding(input: OnboardingInput): OnboardingValidation {
  if (!EXAM_SECOND_SUBJECTS.includes(input.secondSubject as ExamSecondSubject)) {
    return { ok: false, error: 'invalid_subject' };
  }
  const examDate = validateExamDate(input.examDate);
  if (!examDate) return { ok: false, error: 'invalid_exam_date' };
  if (!Number.isFinite(input.targetScore)) return { ok: false, error: 'invalid_target_score' };

  return {
    ok: true,
    value: {
      secondSubject: input.secondSubject as ExamSecondSubject,
      examDate,
      targetScore: clampTargetScore(input.targetScore),
    },
  };
}
