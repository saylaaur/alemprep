import { SUBJECT_VALUES, type ReferenceQuestion, type Subject, type TranscriptionItem } from './schema';

export interface SubjectGroup {
  subject: Subject;
  items: ReferenceQuestion[];
}

/**
 * Группирует непропущенные задания по subject для авто-режима gen-all.ts
 * (без --subject). Задания с subject: null/undefined исключаются — по идее
 * их уже не должно быть в списке (applySubjectFilter в transcribe-questions.ts
 * превращает их в skip ещё на транскрипции), но проверяем и здесь, а не
 * доверяем входным данным вслепую. Порядок групп — по SUBJECT_VALUES, пустые
 * предметы не возвращаются.
 */
export function groupBySubject(items: TranscriptionItem[]): SubjectGroup[] {
  const bySubject = new Map<Subject, ReferenceQuestion[]>();
  for (const item of items) {
    if ('skip' in item) continue;
    if (!item.subject) continue;
    const list = bySubject.get(item.subject) ?? [];
    list.push(item);
    bySubject.set(item.subject, list);
  }
  return SUBJECT_VALUES.filter((s) => bySubject.has(s)).map((subject) => ({
    subject,
    items: bySubject.get(subject)!,
  }));
}

/** Имя reference-файла для предмета — тот же формат, что уже пишет transcribe-questions.ts. */
export function subjectReferenceFileName(subject: string, timestamp: string): string {
  return `${subject}-${timestamp}.json`;
}
