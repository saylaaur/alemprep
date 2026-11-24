import 'server-only';

import { parseBookContent } from '@/lib/books/content';
import { localDateStr } from '@/lib/streak';
import type { BookDetail, DueBook, LibrarySubject } from '@/lib/supabase/queries/books';
import type { BookRepository } from '@/lib/books/service';
import type { Locale } from '@/types/db';
import { createLocalBookRepository } from './book-repository';
import { bookContentOf } from './book-content';
import { buildBook, buildDueBooks, buildLibrary, findCatalogBook } from './library';
import { activityOn } from './activity';
import { readLocalState, writeLocalState } from './store';

/** Локальные версии запросов из lib/supabase/queries/books.ts. */
export async function localLibrary(locale: Locale): Promise<LibrarySubject[]> {
  return buildLibrary({ locale, state: await readLocalState(), today: localDateStr(), content: bookContentOf });
}

export async function localBook(slug: string, locale: Locale): Promise<BookDetail | null> {
  return buildBook({ slug, locale, state: await readLocalState(), today: localDateStr(), content: bookContentOf });
}

export async function localBookReviewsToday(locale: Locale): Promise<{ due: DueBook[]; reviewedToday: number }> {
  const state = await readLocalState();
  const today = localDateStr();
  return { due: buildDueBooks({ locale, state, today }), reviewedToday: activityOn(state, today).cards };
}

/** Хранилище для сервиса выдачи и повторений книг (см. lib/supabase/book-actions.ts). */
export async function createLocalBooks(): Promise<BookRepository> {
  return createLocalBookRepository({
    state: await readLocalState(),
    save: writeLocalState,
    catalog: (slug) => {
      const book = findCatalogBook(slug);
      return book ? { hasContent: parseBookContent(bookContentOf(slug)?.ru) !== null } : null;
    },
  });
}
