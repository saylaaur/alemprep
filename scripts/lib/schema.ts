import { z } from 'zod';

export const MATH_TOPIC_SLUGS = [
  'algebra',
  'equations',
  'functions',
  'logarithms',
  'trigonometry',
  'progressions',
  'planimetry',
  'stereometry',
  'derivatives',
  'combinatorics',
  'statistics',
  'text_problems',
] as const;

export type MathTopicSlug = (typeof MATH_TOPIC_SLUGS)[number];

const AnswerOptionSchema = z.object({
  id: z.string(),
  content: z.string(),
});

const ContentBlockSchema = z.object({
  type: z.enum(['text', 'latex', 'image']).optional(),
  value: z.string(),
});

export const ExplanationSchema = z.object({
  blocks: z.array(ContentBlockSchema).min(1),
});

export const SingleBodySchema = z.object({
  stem: z.string().min(1),
  options: z.array(AnswerOptionSchema).min(2),
  correct: z.string(),
});

export const MultiBodySchema = z.object({
  stem: z.string().min(1),
  options: z.array(AnswerOptionSchema).min(2),
  correct: z.array(z.string()).min(1),
});

export const MatchingBodySchema = z.object({
  stem: z.string().min(1),
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
  topic_slug: z.enum(MATH_TOPIC_SLUGS),
  type: z.enum(['single', 'multi', 'matching']),
  difficulty: z.number().int().min(1).max(5),
  body: QuestionBodySchema,
  explanation: ExplanationSchema,
  source_file: z.string(),
});

export const SkipItemSchema = z.object({
  skip: z.enum(['graph', 'unsupported']),
  reason: z.string(),
  source_file: z.string(),
});

export const GeneratedQuestionSchema = z.object({
  topic_slug: z.enum(MATH_TOPIC_SLUGS),
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
