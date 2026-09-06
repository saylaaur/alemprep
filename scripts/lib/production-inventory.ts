import type { Locale, QuestionType } from '@/types/db';

export type InventoryQuestion = {
  topic_id: string;
  language: Locale;
  type: QuestionType;
  is_published: boolean;
};

export type InventoryTopic = { id: string; subject_id: string };
export type InventorySubject = { id: string; slug: string };

export type InventorySummary = {
  total: number;
  published: number;
  drafts: number;
  byLanguageAndType: Record<Locale, Record<QuestionType, number>>;
  bySubject: Array<{ slug: string; published: number; drafts: number }>;
};

const emptyTypeCounts = (): Record<QuestionType, number> => ({ single: 0, multi: 0, matching: 0 });

/** Summarises only delivery metadata; question text and answers never enter the report. */
export function buildInventorySummary(
  questions: InventoryQuestion[],
  topics: InventoryTopic[],
  subjects: InventorySubject[],
): InventorySummary {
  const byLanguageAndType: Record<Locale, Record<QuestionType, number>> = {
    ru: emptyTypeCounts(),
    kk: emptyTypeCounts(),
  };
  const subjectByTopic = new Map(topics.map((topic) => [topic.id, topic.subject_id]));
  const countsBySubject = new Map(subjects.map((subject) => [subject.id, { published: 0, drafts: 0 }]));

  let published = 0;
  let drafts = 0;
  for (const question of questions) {
    if (question.is_published) {
      published += 1;
      byLanguageAndType[question.language][question.type] += 1;
    } else {
      drafts += 1;
    }

    const subjectId = subjectByTopic.get(question.topic_id);
    const subjectCounts = subjectId ? countsBySubject.get(subjectId) : undefined;
    if (subjectCounts) subjectCounts[question.is_published ? 'published' : 'drafts'] += 1;
  }

  return {
    total: questions.length,
    published,
    drafts,
    byLanguageAndType,
    bySubject: subjects.map((subject) => ({ slug: subject.slug, ...countsBySubject.get(subject.id)! })),
  };
}
