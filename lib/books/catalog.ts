import catalog from '../../scripts/data/books-catalog.json';

export const BOOK_SUBJECTS = ['math', 'physics', 'informatics'] as const;
export type BookSubject = (typeof BOOK_SUBJECTS)[number];

export type CatalogBook = {
  subject: BookSubject;
  /** slug официальной темы НЦТ (topics.slug) */
  topic: string;
  /** порядок внутри темы, с 1 */
  sortOrder: number;
  slug: string;
  nameRu: string;
  nameKk: string;
};

type RawCatalog = { subjects: Record<string, Record<string, Array<{ slug: string; name_ru: string; name_kk: string }>>> };

/** План книг: каждая официальная тема разбита на подтемы-книги. */
export function loadBooksCatalog(): CatalogBook[] {
  const raw = catalog as RawCatalog;
  const out: CatalogBook[] = [];
  for (const subject of BOOK_SUBJECTS) {
    for (const [topic, books] of Object.entries(raw.subjects[subject] ?? {})) {
      books.forEach((b, i) => out.push({ subject, topic, sortOrder: i + 1, slug: b.slug, nameRu: b.name_ru, nameKk: b.name_kk }));
    }
  }
  return out;
}
