import type { Question, QuestionBody } from '@/types/db';

export type AnswerState = string | string[] | Record<string, string> | null;

/** Ответ фактически пуст: null, '', [], либо объект без единого заполненного значения. */
export function isAnswerEmpty(answer: unknown): boolean {
  if (answer === null || answer === undefined) return true;
  if (typeof answer === 'string') return answer.length === 0;
  if (Array.isArray(answer)) return answer.length === 0;
  if (typeof answer === 'object') {
    return !Object.values(answer as Record<string, unknown>).some(
      (v) => typeof v === 'string' && v.length > 0
    );
  }
  return true;
}

/** Ответ заполнен полностью — можно нажимать «Проверить». */
export function isAnswerComplete(type: Question['type'], answer: AnswerState, body: QuestionBody): boolean {
  if (answer === null) return false;
  if (type === 'single') return typeof answer === 'string' && answer.length > 0;
  if (type === 'multi') return Array.isArray(answer) && answer.length > 0;
  if (type === 'matching' && 'left' in body) {
    if (typeof answer !== 'object' || Array.isArray(answer)) return false;
    const obj = answer as Record<string, string>;
    return body.left.every((l) => obj[l.id]);
  }
  return false;
}

/** Полностью правильный ответ (без частичного зачёта — для тренажёра). */
export function checkAnswer(type: Question['type'], answer: AnswerState, body: QuestionBody): boolean {
  if (answer === null) return false;
  if (type === 'single' && 'correct' in body && typeof body.correct === 'string') {
    return answer === body.correct;
  }
  if (type === 'multi' && 'correct' in body && Array.isArray(body.correct)) {
    if (!Array.isArray(answer)) return false;
    if (answer.length !== body.correct.length) return false;
    return body.correct.every((c) => answer.includes(c));
  }
  if (type === 'matching' && 'correct' in body && typeof body.correct === 'object' && !Array.isArray(body.correct)) {
    if (typeof answer !== 'object' || Array.isArray(answer)) return false;
    const a = answer as Record<string, string>;
    const c = body.correct as Record<string, string>;
    return Object.keys(c).every((k) => a[k] === c[k]);
  }
  return false;
}
