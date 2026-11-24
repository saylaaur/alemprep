import acceleratedMotion from '../../scripts/data/cards/accelerated-motion.json';
import newtonLaws from '../../scripts/data/cards/newton-laws.json';
import type { Locale } from '@/types/db';
import { parseCardDeck, type StudyCard } from './content';

/**
 * Карточки по книгам. Новая книга = новый JSON в scripts/data/cards и строка здесь.
 * Карточки статичны и лежат в репозитории (в базу их не переносим), поэтому
 * работают и в локальном режиме, и с Supabase.
 */
type RawDeck = { ru?: unknown; kk?: unknown };

const REGISTRY: Record<string, RawDeck> = {
  'accelerated-motion': acceleratedMotion,
  'newton-laws': newtonLaws,
};

export type CardDeck = { cards: StudyCard[]; /** показываем русскую версию вместо казахской */ fallback: boolean };

export function cardsOf(slug: string, locale: Locale): CardDeck | null {
  if (!Object.prototype.hasOwnProperty.call(REGISTRY, slug)) return null;
  const raw = REGISTRY[slug];
  const ru = parseCardDeck(raw.ru);
  const kk = locale === 'kk' ? parseCardDeck(raw.kk) : null;
  if (kk) return { cards: kk, fallback: false };
  if (!ru) return null;
  return { cards: ru, fallback: locale === 'kk' };
}
