import { z } from 'zod';

/**
 * Видеоурок: видео + 12–15 задач для закрепления + пробник строго по теме.
 * Тексты на русском обязательны; казахские — по мере готовности (иначе показываем русские).
 */
const text = z.string().trim().min(1).max(900);

export const lessonQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(60),
    level: z.enum(['easy', 'medium', 'hard']),
    question: text,
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
    /** Индекс верного ответа в исходном порядке options. */
    correct: z.number().int().min(0),
    solution: text,
  })
  .strict()
  .refine((q) => q.correct < q.options.length, { message: 'correct вне options' });

const contentSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    problems: z.array(lessonQuestionSchema).min(12).max(15),
    mock: z.array(lessonQuestionSchema).min(8).max(20),
  })
  .strict();

export const lessonSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    subject: z.enum(['math', 'physics', 'informatics']),
    /** slug книги-конспекта, которая лежит справа от видео. */
    bookSlug: z.string().regex(/^[a-z0-9-]+$/),
    video: z.string().startsWith('/'),
    poster: z.string().startsWith('/'),
    durationSec: z.number().int().positive(),
    ru: contentSchema,
    /** Пока готов только заголовок: задачи и пробник идут на русском. */
    kk: contentSchema.partial().extend({ title: z.string().trim().min(1).max(80) }).optional(),
  })
  .strict();

export type LessonQuestion = z.infer<typeof lessonQuestionSchema>;
export type LessonData = z.infer<typeof lessonSchema>;
