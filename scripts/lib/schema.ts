import { z } from 'zod';
import officialTopics from '../data/official-topics.json';

interface OfficialTopic {
  no: number;
  slug: string;
  name_ru: string;
}

interface OfficialSection {
  no: number;
  name_ru: string;
  topics: OfficialTopic[];
}

interface OfficialSubject {
  name_ru: string;
  questions: number;
  max_score: number;
  sections: OfficialSection[];
}

function slugsForSubject(subject: OfficialSubject): readonly string[] {
  return subject.sections.flatMap((section) => section.topics.map((topic) => topic.slug));
}

/**
 * Списки topic_slug генерируются из официальных спецификаций НЦТ
 * (scripts/data/official-topics.json — извлечено из PDF testcenter.kz,
 * без переписывания формулировок), а не держатся руками — иначе разъедутся
 * при обновлении спецификаций. См. supabase/migrations/0019.
 */
export const MATH_TOPIC_SLUGS = slugsForSubject(officialTopics.math as OfficialSubject);
export const PHYSICS_TOPIC_SLUGS = slugsForSubject(officialTopics.physics as OfficialSubject);
export const INFORMATICS_TOPIC_SLUGS = slugsForSubject(officialTopics.informatics as OfficialSubject);
export const MATH_LITERACY_TOPIC_SLUGS = slugsForSubject(
  officialTopics['math-literacy'] as OfficialSubject,
);

/** Список допустимых topic_slug по предмету — для промптов и валидации пайплайна. */
export const SUBJECT_TOPIC_SLUGS: Record<string, readonly string[]> = {
  math: MATH_TOPIC_SLUGS,
  informatics: INFORMATICS_TOPIC_SLUGS,
  physics: PHYSICS_TOPIC_SLUGS,
  'math-literacy': MATH_LITERACY_TOPIC_SLUGS,
};

/** Человекочитаемое название предмета (для system-промпта на англ.). */
export const SUBJECT_LABEL: Record<string, string> = {
  math: 'mathematics',
  informatics: 'computer science (informatics)',
  physics: 'physics',
  'math-literacy': 'mathematical literacy',
};

export function getTopicSlugs(subject: string): readonly string[] {
  return SUBJECT_TOPIC_SLUGS[subject] ?? MATH_TOPIC_SLUGS;
}

export const SUBJECT_VALUES = ['math', 'physics', 'informatics', 'math-literacy'] as const;
export const SubjectSchema = z.enum(SUBJECT_VALUES);
export type Subject = z.infer<typeof SubjectSchema>;

export const QUESTION_TYPES = ['single', 'multi', 'matching'] as const;
export const QuestionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/** Префикс имени файла, когда транскрипция идёт без --subject (см. gen-all.ts). */
export const AUTO_SUBJECT_PREFIX = 'mixed';

/**
 * Уровни трудности из официальной спецификации НЦТ (один вариант: 50% базовый,
 * 30% средний, 20% высокий — scripts/data/official-topics.json:_difficulty).
 * Модель определяет уровень по описанию, маппинг в существующую шкалу
 * difficulty (1–5) — A→2, B→3, C→4; крайние значения 1/5 остаются свободны,
 * схему БД не меняем.
 */
export const DIFFICULTY_LEVEL_PROMPT = `Determine the difficulty level per the official ЕНТ specification (one variant is 50% A, 30% B, 20% C), then map it to the numeric "difficulty" field:
- A (базовый) — reproduction of simple skills by direct instructions → difficulty 2
- B (средний) — recognition of simple models, analysis and comparison → difficulty 3
- C (высокий) — integration of knowledge, complex models, generalization → difficulty 4`;

const AnswerOptionSchema = z.object({
  id: z.string(),
  content: z.string(),
});

const TextContentBlockSchema = z.object({
  type: z.enum(['text', 'latex', 'image']).optional(),
  value: z.string(),
});

const TableContentBlockSchema = z
  .object({
    type: z.literal('table'),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
  })
  .refine((block) => block.rows.every((row) => row.length === block.columns.length), {
    message: 'each table row must have the same number of cells as columns',
  });

const ContentBlockSchema = z.union([TextContentBlockSchema, TableContentBlockSchema]);

export const ExplanationSchema = z.object({
  blocks: z.array(ContentBlockSchema).min(1),
});

export const SingleBodySchema = z.object({
  stem: z.string().min(1),
  stem_blocks: z.array(ContentBlockSchema).min(1).optional(),
  options: z.array(AnswerOptionSchema).min(2),
  correct: z.string(),
});

export const MultiBodySchema = z.object({
  stem: z.string().min(1),
  stem_blocks: z.array(ContentBlockSchema).min(1).optional(),
  options: z.array(AnswerOptionSchema).min(2),
  correct: z.array(z.string()).min(1),
});

export const MatchingBodySchema = z.object({
  stem: z.string().min(1),
  stem_blocks: z.array(ContentBlockSchema).min(1).optional(),
  left: z.array(AnswerOptionSchema).min(2),
  right: z.array(z.string()).min(2),
  correct: z.record(z.string(), z.string()),
});

export const QuestionBodySchema = z.union([
  SingleBodySchema,
  MultiBodySchema,
  MatchingBodySchema,
]);

export const ReferenceQuestionSchema = z.object({
  topic_slug: z.string().min(1), // валидируется против списка предмета в пайплайне + при insert
  subject: SubjectSchema.nullable().optional(), // --multi: предмет, определённый моделью по странице
  type: z.enum(['single', 'multi', 'matching']),
  difficulty: z.number().int().min(1).max(5),
  body: QuestionBodySchema,
  explanation: ExplanationSchema,
  source_file: z.string(),
  has_image: z.boolean().optional(), // true for questions with visual diagrams (Epic C)
});

export const SkipItemSchema = z.object({
  skip: z.enum(['graph', 'unsupported']),
  reason: z.string(),
  source_file: z.string(),
});

export const GeneratedQuestionSchema = z.object({
  topic_slug: z.string().min(1), // валидируется против списка предмета в пайплайне + при insert
  subject: SubjectSchema.nullable().optional(), // унаследован от reference, если был определён
  type: z.enum(['single', 'multi', 'matching']),
  difficulty: z.number().int().min(1).max(5),
  body: QuestionBodySchema,
  explanation: ExplanationSchema,
  variant_of: z.string(),
});

export type ReferenceQuestion = z.infer<typeof ReferenceQuestionSchema>;
export type SkipItem = z.infer<typeof SkipItemSchema>;
export type TranscriptionItem = ReferenceQuestion | SkipItem;
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type SingleBody = z.infer<typeof SingleBodySchema>;
export type MultiBody = z.infer<typeof MultiBodySchema>;
export type MatchingBody = z.infer<typeof MatchingBodySchema>;
export type QuestionBody = z.infer<typeof QuestionBodySchema>;
export type ExplanationType = z.infer<typeof ExplanationSchema>;

/** Ответ переводчика (scripts/translate-questions.ts): та же структура body+explanation. */
export const TranslationResponseSchema = z.object({
  body: QuestionBodySchema,
  explanation: ExplanationSchema,
});
export type TranslationResponse = z.infer<typeof TranslationResponseSchema>;

/**
 * Проверенный перевод, готовый к вставке (scripts/translated,
 * scripts/verified-translations → insert-to-db.ts --language kk).
 * topic_id/context_id — те же, что у оригинала (не ищем по slug заново).
 */
export const TranslatedQuestionSchema = z.object({
  source_question_id: z.string().min(1),
  topic_id: z.string().min(1),
  context_id: z.string().nullable(),
  type: z.enum(['single', 'multi', 'matching']),
  difficulty: z.number().int().min(1).max(5),
  body: QuestionBodySchema,
  explanation: ExplanationSchema,
  sort_order: z.number().int(),
});
export type TranslatedQuestion = z.infer<typeof TranslatedQuestionSchema>;
