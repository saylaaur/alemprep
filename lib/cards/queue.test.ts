import { describe, expect, it } from 'vitest';
import { nextToReview, queueProgress } from './queue';

const books = [
  { slug: 'a', hasCards: true },
  { slug: 'b', hasCards: false },
  { slug: 'c', hasCards: true },
];

describe('очередь повторения', () => {
  it('берёт первую книгу с карточками', () => {
    expect(nextToReview(books, new Set())?.slug).toBe('a');
  });
  it('пропускает пройденные и книги без карточек', () => {
    expect(nextToReview(books, new Set(['a']))?.slug).toBe('c');
    expect(nextToReview(books, new Set(['a', 'c']))).toBeNull();
  });
  it('считает прогресс', () => {
    expect(queueProgress(books, new Set())).toEqual({ total: 3, done: 0, hasNext: true, allDone: false });
    expect(queueProgress(books, new Set(['a', 'c']))).toEqual({ total: 3, done: 2, hasNext: false, allDone: false });
    expect(queueProgress(books, new Set(['a', 'b', 'c']))).toMatchObject({ done: 3, allDone: true });
  });
  it('пустая очередь не считается «всё повторено»', () => {
    expect(queueProgress([], new Set())).toEqual({ total: 0, done: 0, hasNext: false, allDone: false });
  });
});
