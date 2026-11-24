import type { BookRepository } from '@/lib/books/service';
import { recordActivity } from './activity';
import type { LocalState } from './state';

/**
 * Хранилище книг для локального режима. Интерфейс тот же, что у Supabase-версии
 * (lib/books/repository.ts), поэтому сервис выдачи и повторений один и тот же.
 * Состояние держим в замыкании и записываем после каждого изменения.
 */
export function createLocalBookRepository(deps: {
  state: LocalState;
  save: (state: LocalState) => Promise<void>;
  /** Есть ли у книги в каталоге написанный конспект; null — такой книги нет. */
  catalog: (slug: string) => { hasContent: boolean } | null;
}): BookRepository {
  let state = deps.state;
  const commit = async (next: LocalState) => {
    await deps.save(next);
    state = next;
  };

  return {
    async findBook(slug) {
      const book = deps.catalog(slug);
      return book ? { id: slug, hasContent: book.hasContent } : null;
    },

    async getUserBook(_userId, bookId) {
      const b = state.books[bookId];
      return b ? { stage: b.stage, dueOn: b.dueOn, reviewsCount: b.reviewsCount, lapses: b.lapses } : null;
    },

    async insertUserBook({ bookId, receivedOn, schedule }) {
      if (state.books[bookId]) return false;
      await commit({
        ...state,
        books: { ...state.books, [bookId]: { stage: schedule.stage, dueOn: schedule.dueOn, receivedOn, reviewsCount: 0, lapses: 0 } },
      });
      return true;
    },

    async recordReview({ bookId, previous, schedule, reviewedOn, lapse }) {
      const current = state.books[bookId];
      if (!current || current.stage !== previous.stage || current.dueOn !== previous.dueOn) return false;
      await commit(recordActivity({
        ...state,
        books: {
          ...state.books,
          [bookId]: {
            ...current,
            ...schedule,
            reviewsCount: current.reviewsCount + 1,
            lapses: current.lapses + (lapse ? 1 : 0),
          },
        },
      }, reviewedOn, { cards: 1 }));
      return true;
    },
  };
}
