import type { LibrarySubject } from '@/lib/supabase/queries/books';

/** Урок, задачи которого лежат в папке темы. */
export type FolderLesson = { id: string; title: string; bookSlug: string; count: number };

export type TopicFolder = { slug: string; name: string; topicNo: number | null; count: number; bank: number; lessons: FolderLesson[] };
export type SubjectFolder = { slug: string; name: string; count: number; topics: TopicFolder[] };

/**
 * Раздел «Задачи»: папка на каждый предмет, внутри — папка на каждую тему ЕНТ.
 * Задачи берём из видеоуроков (урок попадает в тему своей книги) и из банка генератора.
 * Темы без задач остаются в каталоге данных с нулевым счётчиком.
 */
export function buildProblemFolders(
  library: LibrarySubject[],
  lessons: FolderLesson[],
  bank: Map<string, number> = new Map()
): SubjectFolder[] {
  return library.map((s) => {
    const topics = s.topics.map((tp) => {
      const slugs = new Set(tp.books.map((b) => b.slug));
      const own = lessons.filter((l) => slugs.has(l.bookSlug));
      const fromBank = bank.get(tp.slug) ?? 0;
      return { slug: tp.slug, name: tp.name, topicNo: tp.topicNo, count: own.reduce((n, l) => n + l.count, 0) + fromBank, bank: fromBank, lessons: own };
    });
    return { slug: s.slug, name: s.name, count: topics.reduce((n, tp) => n + tp.count, 0), topics };
  });
}
