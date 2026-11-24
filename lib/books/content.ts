import { z } from 'zod';

/**
 * Содержимое книги-конспекта. Хранится в books.content_ru / content_kk (JSONB).
 * В строках можно писать формулы KaTeX в `$...$` — их рисует MathText.
 */
const text = z.string().trim().min(1).max(600);

export const bookBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text }).strict(),
  /** Выделенная формула (KaTeX без $). */
  z.object({ type: z.literal('formula'), tex: z.string().trim().min(1).max(300) }).strict(),
  z.object({ type: z.literal('list'), items: z.array(text).min(1).max(12), ordered: z.boolean().optional() }).strict(),
  /** Пояснение в плашке. */
  z.object({ type: z.literal('note'), text }).strict(),
  /** Ловушки ЕНТ — типичные ошибки. */
  z.object({ type: z.literal('trap'), items: z.array(text).min(1).max(8) }).strict(),
]);

export const bookPageSchema = z
  .object({
    kicker: z.string().trim().max(60).optional(),
    title: z.string().trim().min(1).max(80),
    blocks: z.array(bookBlockSchema).min(1).max(10),
  })
  .strict();

export const bookContentSchema = z.object({ pages: z.array(bookPageSchema).min(1).max(16) }).strict();

export type BookBlock = z.infer<typeof bookBlockSchema>;
export type BookPage = z.infer<typeof bookPageSchema>;
export type BookContent = z.infer<typeof bookContentSchema>;

/** Безопасный разбор: битый JSON из базы → null («конспект готовится»). */
export function parseBookContent(raw: unknown): BookContent | null {
  const r = bookContentSchema.safeParse(raw);
  return r.success ? r.data : null;
}
