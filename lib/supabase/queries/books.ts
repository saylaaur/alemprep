import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { parseBookContent, type BookContent } from '@/lib/books/content';
import { bookStateOf, type BookState } from '@/lib/books/state';
import { isLocalMode } from '@/lib/data-mode';
import { localBook, localBookReviewsToday, localLibrary } from '@/lib/local/books';
import { localDateStr } from '@/lib/streak';
import type { Locale } from '@/types/db';

export type { BookState };

export type LibraryBook = {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  hasContent: boolean;
  received: boolean;
  stage: number;
  dueOn: string | null;
  state: BookState;
};

export type LibraryTopic = { slug: string; name: string; sectionNo: number | null; topicNo: number | null; books: LibraryBook[] };
export type LibrarySubject = { slug: string; name: string; topics: LibraryTopic[] };

type BookRow = {
  id: string;
  slug: string;
  sort_order: number;
  name_ru: string;
  name_kk: string | null;
  has_content: boolean;
  topics: {
    slug: string;
    name_ru: string;
    name_kk: string | null;
    topic_no: number | null;
    section_no: number | null;
    subjects: { slug: string; name_ru: string; name_kk: string | null; sort_order: number };
  };
};

type UserBookRow = { book_id: string; stage: number; due_on: string | null };

function stateOf(hasContent: boolean, ub: UserBookRow | undefined, today: string): BookState {
  return bookStateOf(hasContent, ub ? { stage: ub.stage, dueOn: ub.due_on } : undefined, today);
}

const pick = (locale: Locale, ru: string, kk: string | null) => (locale === 'kk' && kk ? kk : ru);

/** Все книги по предметам и темам + состояние каждой книги у ученика. */
export async function getLibrary(locale: Locale): Promise<LibrarySubject[]> {
  if (isLocalMode()) return localLibrary(locale);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  const [booksRes, userBooksRes] = await Promise.all([
    supabase
      .from('books')
      .select('id, slug, sort_order, name_ru, name_kk, has_content, topics!inner(slug, name_ru, name_kk, topic_no, section_no, subjects!inner(slug, name_ru, name_kk, sort_order))'),
    userId
      ? supabase.from('user_books').select('book_id, stage, due_on').eq('user_id', userId)
      : Promise.resolve({ data: [] as UserBookRow[], error: null }),
  ]);
  if (booksRes.error) throw booksRes.error;
  if (userBooksRes.error) throw userBooksRes.error;

  const today = localDateStr();
  const mine = new Map(((userBooksRes.data ?? []) as UserBookRow[]).map((r) => [r.book_id, r]));
  const subjects = new Map<string, LibrarySubject & { order: number }>();
  for (const raw of (booksRes.data ?? []) as unknown as BookRow[]) {
    const t = raw.topics;
    const s = t.subjects;
    const subject = subjects.get(s.slug) ?? { slug: s.slug, name: pick(locale, s.name_ru, s.name_kk), topics: [], order: s.sort_order };
    subjects.set(s.slug, subject);
    let topic = subject.topics.find((x) => x.slug === t.slug);
    if (!topic) {
      topic = { slug: t.slug, name: pick(locale, t.name_ru, t.name_kk), sectionNo: t.section_no, topicNo: t.topic_no, books: [] };
      subject.topics.push(topic);
    }
    const hasContent = raw.has_content === true;
    const ub = mine.get(raw.id);
    topic.books.push({
      id: raw.id,
      slug: raw.slug,
      name: pick(locale, raw.name_ru, raw.name_kk),
      sortOrder: raw.sort_order,
      hasContent,
      received: Boolean(ub),
      stage: ub?.stage ?? 0,
      dueOn: ub?.due_on ?? null,
      state: stateOf(hasContent, ub, today),
    });
  }
  return [...subjects.values()]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      topics: s.topics
        .sort((a, b) => (a.topicNo ?? 999) - (b.topicNo ?? 999))
        .map((tp) => ({ ...tp, books: tp.books.sort((a, b) => a.sortOrder - b.sortOrder) })),
    }));
}

export type BookDetail = {
  id: string;
  slug: string;
  name: string;
  topicName: string;
  subjectSlug: string;
  subjectName: string;
  content: BookContent | null;
  /** Показан русский конспект, потому что казахского ещё нет. */
  contentFallback: boolean;
  videoUrl: string | null;
  received: boolean;
  stage: number;
  dueOn: string | null;
  receivedOn: string | null;
  reviewsCount: number;
  state: BookState;
};

export async function getBook(slug: string, locale: Locale): Promise<BookDetail | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  if (isLocalMode()) return localBook(slug, locale);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  const { data, error } = await supabase
    .from('books')
    .select('id, slug, name_ru, name_kk, content_ru, content_kk, video_url, topics!inner(name_ru, name_kk, subjects!inner(slug, name_ru, name_kk))')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    id: string; slug: string; name_ru: string; name_kk: string | null; content_ru: unknown; content_kk: unknown; video_url: string | null;
    topics: { name_ru: string; name_kk: string | null; subjects: { slug: string; name_ru: string; name_kk: string | null } };
  };
  const ub = userId
    ? (
        await supabase
          .from('user_books')
          .select('book_id, stage, due_on, received_on, reviews_count')
          .eq('user_id', userId)
          .eq('book_id', row.id)
          .maybeSingle()
      ).data
    : null;

  const kk = locale === 'kk' ? parseBookContent(row.content_kk) : null;
  const ru = parseBookContent(row.content_ru);
  const content = kk ?? ru;
  return {
    id: row.id,
    slug: row.slug,
    name: pick(locale, row.name_ru, row.name_kk),
    topicName: pick(locale, row.topics.name_ru, row.topics.name_kk),
    subjectSlug: row.topics.subjects.slug,
    subjectName: pick(locale, row.topics.subjects.name_ru, row.topics.subjects.name_kk),
    content,
    contentFallback: locale === 'kk' && !kk && Boolean(ru),
    videoUrl: row.video_url,
    received: Boolean(ub),
    stage: ub?.stage ?? 0,
    dueOn: ub?.due_on ?? null,
    receivedOn: ub?.received_on ?? null,
    reviewsCount: ub?.reviews_count ?? 0,
    state: stateOf(Boolean(ru), ub ?? undefined, localDateStr()),
  };
}

export type DueBook = { slug: string; name: string; subjectName: string; dueOn: string; stage: number; overdueDays: number };

/** Книги к повторению на сегодня (включая просроченные) и сколько уже повторено сегодня. */
export async function getBookReviewsToday(userId: string, locale: Locale): Promise<{ due: DueBook[]; reviewedToday: number }> {
  if (isLocalMode()) return localBookReviewsToday(locale);
  const supabase = await createClient();
  const today = localDateStr();
  const [dueRes, doneRes] = await Promise.all([
    supabase
      .from('user_books')
      .select('stage, due_on, books!inner(slug, name_ru, name_kk, topics!inner(subjects!inner(name_ru, name_kk)))')
      .eq('user_id', userId)
      .lte('due_on', today)
      .order('due_on', { ascending: true })
      .limit(20),
    supabase
      .from('book_reviews')
      .select('book_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('reviewed_on', today)
      .eq('counted', true),
  ]);
  if (dueRes.error) throw dueRes.error;
  if (doneRes.error) throw doneRes.error;
  const due = ((dueRes.data ?? []) as unknown as Array<{
    stage: number; due_on: string;
    books: { slug: string; name_ru: string; name_kk: string | null; topics: { subjects: { name_ru: string; name_kk: string | null } } };
  }>).map((r) => ({
    slug: r.books.slug,
    name: pick(locale, r.books.name_ru, r.books.name_kk),
    subjectName: pick(locale, r.books.topics.subjects.name_ru, r.books.topics.subjects.name_kk),
    dueOn: r.due_on,
    stage: r.stage,
    overdueDays: Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${r.due_on}T00:00:00Z`)) / 86_400_000)),
  }));
  return { due, reviewedToday: doneRes.count ?? 0 };
}
