import acceleratedMotion from '../../scripts/data/books/accelerated-motion.json';
import newtonLaws from '../../scripts/data/books/newton-laws.json';

/**
 * Написанные конспекты для локального режима (в базе они лежат в books.content_ru/kk).
 * Новая книга = новый JSON в scripts/data/books и строка здесь.
 */
export type RawBookContent = { ru?: unknown; kk?: unknown };

const REGISTRY: Record<string, RawBookContent> = {
  'accelerated-motion': acceleratedMotion,
  'newton-laws': newtonLaws,
};

export function bookContentOf(slug: string): RawBookContent | undefined {
  return Object.prototype.hasOwnProperty.call(REGISTRY, slug) ? REGISTRY[slug] : undefined;
}
