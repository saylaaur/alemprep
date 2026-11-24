import officialTopics from '../../scripts/data/official-topics.json';
import { BOOK_SUBJECTS, loadBooksCatalog, type BookSubject, type CatalogBook } from '@/lib/books/catalog';
import { parseBookContent } from '@/lib/books/content';
import { bookStateOf } from '@/lib/books/state';
import { daysBetween } from '@/lib/books/schedule';
import type { BookDetail, DueBook, LibrarySubject } from '@/lib/supabase/queries/books';
import type { Locale } from '@/types/db';
import type { RawBookContent } from './book-content';
import type { LocalState } from './state';

/**
 * Каталог и состояние книг для локального режима: то же, что отдаёт Supabase-версия
 * (getLibrary / getBook / getBookReviewsToday), но из файлов репозитория и cookie ученика.
 * Чистые функции: всё нужное приходит аргументами.
 */
type OfficialTopic = { no: number; slug: string; name_ru: string; name_kk?: string | null };
type OfficialSection = { no: number; name_ru: string; topics: OfficialTopic[] };
type OfficialSubject = { name_ru: string; name_kk?: string | null; sections: OfficialSection[] };

const pick = (locale: Locale, ru: string, kk: string | null | undefined) => (locale === 'kk' && kk ? kk : ru);

type TopicInfo = { slug: string; nameRu: string; nameKk: string | null; topicNo: number; sectionNo: number };

function topicIndex(subject: BookSubject): Map<string, TopicInfo> {
  const raw = (officialTopics as unknown as Record<string, OfficialSubject>)[subject];
  const map = new Map<string, TopicInfo>();
  for (const section of raw?.sections ?? []) {
    for (const t of section.topics) {
      map.set(t.slug, { slug: t.slug, nameRu: t.name_ru, nameKk: t.name_kk ?? null, topicNo: t.no, sectionNo: section.no });
    }
  }
  return map;
}

function subjectNames(subject: BookSubject): { ru: string; kk: string | null } {
  const raw = (officialTopics as unknown as Record<string, OfficialSubject>)[subject];
  return { ru: raw?.name_ru ?? subject, kk: raw?.name_kk ?? null };
}

export type ContentLookup = (slug: string) => RawBookContent | undefined;

const hasContentOf = (content: ContentLookup, slug: string) => parseBookContent(content(slug)?.ru) !== null;

export function findCatalogBook(slug: string): CatalogBook | undefined {
  return loadBooksCatalog().find((b) => b.slug === slug);
}

export function buildLibrary(args: { locale: Locale; state: LocalState; today: string; content: ContentLookup }): LibrarySubject[] {
  const { locale, state, today, content } = args;
  const catalog = loadBooksCatalog();
  const out: LibrarySubject[] = [];

  for (const subject of BOOK_SUBJECTS) {
    const topics = topicIndex(subject);
    const names = subjectNames(subject);
    const byTopic = new Map<string, LibrarySubject['topics'][number]>();

    for (const book of catalog.filter((b) => b.subject === subject)) {
      const info = topics.get(book.topic);
      let topic = byTopic.get(book.topic);
      if (!topic) {
        topic = {
          slug: book.topic,
          name: info ? pick(locale, info.nameRu, info.nameKk) : book.topic,
          sectionNo: info?.sectionNo ?? null,
          topicNo: info?.topicNo ?? null,
          books: [],
        };
        byTopic.set(book.topic, topic);
      }
      const hasContent = hasContentOf(content, book.slug);
      const mine = state.books[book.slug];
      topic.books.push({
        id: book.slug,
        slug: book.slug,
        name: pick(locale, book.nameRu, book.nameKk),
        sortOrder: book.sortOrder,
        hasContent,
        received: Boolean(mine),
        stage: mine?.stage ?? 0,
        dueOn: mine?.dueOn ?? null,
        state: bookStateOf(hasContent, mine ? { stage: mine.stage, dueOn: mine.dueOn } : undefined, today),
      });
    }

    if (byTopic.size === 0) continue;
    out.push({
      slug: subject,
      name: pick(locale, names.ru, names.kk),
      topics: [...byTopic.values()]
        .sort((a, b) => (a.topicNo ?? 999) - (b.topicNo ?? 999))
        .map((t) => ({ ...t, books: [...t.books].sort((a, b) => a.sortOrder - b.sortOrder) })),
    });
  }
  return out;
}

export function buildBook(args: { slug: string; locale: Locale; state: LocalState; today: string; content: ContentLookup }): BookDetail | null {
  const { slug, locale, state, today, content } = args;
  const book = findCatalogBook(slug);
  if (!book) return null;
  const info = topicIndex(book.subject).get(book.topic);
  const names = subjectNames(book.subject);
  const raw = content(slug);
  const ru = parseBookContent(raw?.ru);
  const kk = locale === 'kk' ? parseBookContent(raw?.kk) : null;
  const mine = state.books[slug];
  return {
    id: slug,
    slug,
    name: pick(locale, book.nameRu, book.nameKk),
    topicName: info ? pick(locale, info.nameRu, info.nameKk) : book.topic,
    subjectSlug: book.subject,
    subjectName: pick(locale, names.ru, names.kk),
    content: kk ?? ru,
    contentFallback: locale === 'kk' && !kk && Boolean(ru),
    videoUrl: null,
    received: Boolean(mine),
    stage: mine?.stage ?? 0,
    dueOn: mine?.dueOn ?? null,
    receivedOn: mine?.receivedOn ?? null,
    reviewsCount: mine?.reviewsCount ?? 0,
    state: bookStateOf(Boolean(ru), mine ? { stage: mine.stage, dueOn: mine.dueOn } : undefined, today),
  };
}

export function buildDueBooks(args: { locale: Locale; state: LocalState; today: string }): DueBook[] {
  const { locale, state, today } = args;
  const due: DueBook[] = [];
  for (const [slug, mine] of Object.entries(state.books)) {
    if (mine.dueOn === null || mine.dueOn > today) continue;
    const book = findCatalogBook(slug);
    if (!book) continue;
    const names = subjectNames(book.subject);
    due.push({
      slug,
      name: pick(locale, book.nameRu, book.nameKk),
      subjectName: pick(locale, names.ru, names.kk),
      dueOn: mine.dueOn,
      stage: mine.stage,
      overdueDays: Math.max(0, daysBetween(mine.dueOn, today)),
    });
  }
  return due.sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, 20);
}
