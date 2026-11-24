import { applyReview, initialSchedule, type BookSchedule } from './schedule';

/**
 * Получение книги и запись повторения. Хранилище подставляется снаружи:
 * в проде — service_role Supabase (lib/books/repository.ts), в тестах — память.
 * Пользователь берётся только из Auth, дата — из сервера (Asia/Almaty).
 */
export type BookRef = { id: string; hasContent: boolean };
export type StoredUserBook = BookSchedule & { reviewsCount: number; lapses: number };

export type BookRepository = {
  findBook(slug: string): Promise<BookRef | null>;
  getUserBook(userId: string, bookId: string): Promise<StoredUserBook | null>;
  /** false — книга у ученика уже есть */
  insertUserBook(row: { userId: string; bookId: string; receivedOn: string; schedule: BookSchedule }): Promise<boolean>;
  /** Обновить, только если график не изменился с момента чтения. false — гонка. */
  updateUserBook(
    key: { userId: string; bookId: string; expected: BookSchedule },
    next: { schedule: BookSchedule; reviewsCount: number; lapses: number; reviewedAt: string }
  ): Promise<boolean>;
  insertReview(row: {
    userId: string;
    bookId: string;
    reviewedOn: string;
    recalled: number;
    counted: boolean;
    stageBefore: number;
    stageAfter: number;
    dueOnAfter: string | null;
  }): Promise<void>;
};

export type BookError = 'unauthenticated' | 'invalid-input' | 'not-found' | 'not-ready' | 'not-received' | 'conflict';
export type BookResult<T> = { ok: true; value: T } | { ok: false; error: BookError };

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function createBookService(deps: {
  actorId: () => Promise<string | null>;
  repo: BookRepository;
  today: () => string;
  now?: () => string;
}) {
  const now = deps.now ?? (() => new Date().toISOString());

  async function resolve(slug: unknown): Promise<BookResult<{ userId: string; book: BookRef }>> {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.length > 80) return { ok: false, error: 'invalid-input' };
    const userId = await deps.actorId();
    if (!userId) return { ok: false, error: 'unauthenticated' };
    const book = await deps.repo.findBook(slug);
    if (!book) return { ok: false, error: 'not-found' };
    return { ok: true, value: { userId, book } };
  }

  return {
    /** Выдать книгу после урока. Повторный вызов ничего не ломает. */
    async receiveBook(slug: unknown): Promise<BookResult<BookSchedule & { isNew: boolean }>> {
      const r = await resolve(slug);
      if (!r.ok) return r;
      const { userId, book } = r.value;
      if (!book.hasContent) return { ok: false, error: 'not-ready' };
      const today = deps.today();
      const schedule = initialSchedule(today);
      const isNew = await deps.repo.insertUserBook({ userId, bookId: book.id, receivedOn: today, schedule });
      if (isNew) return { ok: true, value: { ...schedule, isNew } };
      const existing = await deps.repo.getUserBook(userId, book.id);
      if (!existing) return { ok: false, error: 'conflict' };
      return { ok: true, value: { stage: existing.stage, dueOn: existing.dueOn, isNew: false } };
    },

    /** Записать повторение. recalled — доля вспомненного 0..1. */
    async reviewBook(slug: unknown, recalled: unknown): Promise<BookResult<BookSchedule & { counted: boolean; lapse: boolean }>> {
      if (typeof recalled !== 'number' || !Number.isFinite(recalled) || recalled < 0 || recalled > 1) {
        return { ok: false, error: 'invalid-input' };
      }
      const r = await resolve(slug);
      if (!r.ok) return r;
      const { userId, book } = r.value;
      const current = await deps.repo.getUserBook(userId, book.id);
      if (!current) return { ok: false, error: 'not-received' };

      const today = deps.today();
      const outcome = applyReview(current, recalled, today);
      const ratio = Math.round(recalled * 1000) / 1000;

      if (outcome.counted) {
        const updated = await deps.repo.updateUserBook(
          { userId, bookId: book.id, expected: { stage: current.stage, dueOn: current.dueOn } },
          {
            schedule: { stage: outcome.stage, dueOn: outcome.dueOn },
            reviewsCount: current.reviewsCount + 1,
            lapses: current.lapses + (outcome.lapse ? 1 : 0),
            reviewedAt: now(),
          }
        );
        if (!updated) return { ok: false, error: 'conflict' };
      }
      // Журнал ведём только по засчитанным повторениям: «слишком раннее» повторение
      // ничего не меняет, а писать его в базу при каждом вызове значило бы дать
      // любому вошедшему пользователю бесплатно раздувать book_reviews.
      if (!outcome.counted) return { ok: true, value: outcome };
      await deps.repo.insertReview({
        userId,
        bookId: book.id,
        reviewedOn: today,
        recalled: ratio,
        counted: outcome.counted,
        stageBefore: current.stage,
        stageAfter: outcome.stage,
        dueOnAfter: outcome.dueOn,
      });
      return { ok: true, value: outcome };
    },
  };
}
