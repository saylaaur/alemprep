import { z } from 'zod';

/**
 * Карточки по теме (по 12–15 штук на книгу-конспект).
 * В тексте можно писать формулы KaTeX в `$...$` — их рисует MathText.
 * `art` — какая иллюстрация рисуется на лицевой стороне карты.
 */
export const CARD_ARTS = ['inertia', 'force', 'action'] as const;
export type CardArt = (typeof CARD_ARTS)[number];

const text = z.string().trim().min(1).max(400);

export const studyCardSchema = z
  .object({
    id: z.string().trim().min(1).max(60),
    front: text,
    back: text,
    art: z.enum(CARD_ARTS).optional(),
  })
  .strict();

export const cardDeckSchema = z
  .array(studyCardSchema)
  .min(1)
  .max(40)
  .refine((deck) => new Set(deck.map((c) => c.id)).size === deck.length, { message: 'duplicate card id' });

export type StudyCard = z.infer<typeof studyCardSchema>;

/** Безопасный разбор: битые данные → null («карточки готовятся»). */
export function parseCardDeck(raw: unknown): StudyCard[] | null {
  const r = cardDeckSchema.safeParse(raw);
  return r.success ? r.data : null;
}
