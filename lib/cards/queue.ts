/**
 * Очередь «Повторить сегодня»: книги, которые пора повторить, идут по порядку.
 * Чистая логика без React — чтобы её можно было проверить тестами.
 */
export type QueueBook = { slug: string; hasCards: boolean };

/** Следующая книга с карточками, которую ещё не прошли в этой очереди. */
export function nextToReview<T extends QueueBook>(books: readonly T[], done: ReadonlySet<string>): T | null {
  return books.find((b) => b.hasCards && !done.has(b.slug)) ?? null;
}

export type QueueProgress = {
  total: number;
  done: number;
  /** Остались книги, которые можно пройти карточками. */
  hasNext: boolean;
  /** Всё повторено (книги без карточек считаем за повторение по книге — их ждёт страница книги). */
  allDone: boolean;
};

export function queueProgress(books: readonly QueueBook[], done: ReadonlySet<string>): QueueProgress {
  const doneCount = books.filter((b) => done.has(b.slug)).length;
  return {
    total: books.length,
    done: doneCount,
    hasNext: nextToReview(books, done) !== null,
    allDone: books.length > 0 && doneCount === books.length,
  };
}
