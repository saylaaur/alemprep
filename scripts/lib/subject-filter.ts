import { SUBJECT_VALUES, type ReferenceQuestion, type Subject, type TranscriptionItem } from './schema';

export const UNDETERMINED_SUBJECT_REASON = 'Не удалось определить предмет';

export type SubjectFilterResult = { keep: true } | { keep: false; reason: string };

/**
 * Пост-обработка --multi: подтверждает subject, определённый моделью для
 * каждого задания (тот же приём, что referencesMissingVisual в checks.ts —
 * детерминантный фильтр поверх ответа модели). targetSubject === undefined —
 * авто-режим без --subject: отбрасываем только null. targetSubject задан —
 * прежнее поведение (фильтр по флагу), плюс теперь ловит задания с явно
 * другим предметом, а не молча приписывает их к targetSubject.
 */
export function applySubjectFilter(
  item: ReferenceQuestion,
  targetSubject: string | undefined,
): SubjectFilterResult {
  if (item.subject == null) {
    return { keep: false, reason: UNDETERMINED_SUBJECT_REASON };
  }
  if (targetSubject !== undefined && item.subject !== targetSubject) {
    return { keep: false, reason: `Другой предмет: ${item.subject} (ожидался ${targetSubject})` };
  }
  return { keep: true };
}

export interface SubjectSummary {
  bySubject: Record<Subject, number>;
  undetermined: number;
}

/** Считает распределение по предметам поверх итогового списка TranscriptionItem. */
export function summarizeBySubject(items: TranscriptionItem[]): SubjectSummary {
  const bySubject = Object.fromEntries(SUBJECT_VALUES.map((s) => [s, 0])) as Record<Subject, number>;
  let undetermined = 0;

  for (const item of items) {
    if ('skip' in item) {
      if (item.reason === UNDETERMINED_SUBJECT_REASON) undetermined++;
      continue;
    }
    if (item.subject) bySubject[item.subject]++;
  }

  return { bySubject, undetermined };
}
