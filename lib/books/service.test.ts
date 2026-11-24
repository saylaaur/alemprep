import { describe, expect, it } from 'vitest';
import { createBookService, type BookRepository, type StoredUserBook } from './service';

function memoryRepo() {
  const books = new Map([
    ['newton-laws', { id: 'b1', hasContent: true }],
    ['kinematics-basics', { id: 'b2', hasContent: false }],
  ]);
  const userBooks = new Map<string, StoredUserBook>();
  const reviews: Array<Record<string, unknown>> = [];
  const key = (u: string, b: string) => `${u}:${b}`;
  const repo: BookRepository = {
    async findBook(slug) { return books.get(slug) ?? null; },
    async getUserBook(u, b) { return userBooks.get(key(u, b)) ?? null; },
    async insertUserBook({ userId, bookId, schedule }) {
      if (userBooks.has(key(userId, bookId))) return false;
      userBooks.set(key(userId, bookId), { ...schedule, reviewsCount: 0, lapses: 0 });
      return true;
    },
    async updateUserBook({ userId, bookId, expected }, next) {
      const cur = userBooks.get(key(userId, bookId));
      if (!cur || cur.stage !== expected.stage || cur.dueOn !== expected.dueOn) return false;
      userBooks.set(key(userId, bookId), { ...next.schedule, reviewsCount: next.reviewsCount, lapses: next.lapses });
      return true;
    },
    async insertReview(row) { reviews.push(row); },
  };
  return { repo, userBooks, reviews };
}

function service(today: { v: string }, user: string | null = 'u1') {
  const m = memoryRepo();
  const svc = createBookService({ actorId: async () => user, repo: m.repo, today: () => today.v, now: () => '2026-11-16T10:00:00Z' });
  return { svc, ...m };
}

describe('book service', () => {
  it('gives a book once, due tomorrow', async () => {
    const day = { v: '2026-11-16' };
    const { svc } = service(day);
    expect(await svc.receiveBook('newton-laws')).toEqual({ ok: true, value: { stage: 0, dueOn: '2026-11-17', isNew: true } });
    expect(await svc.receiveBook('newton-laws')).toEqual({ ok: true, value: { stage: 0, dueOn: '2026-11-17', isNew: false } });
  });

  it('refuses unknown, unfinished and malformed books and anonymous users', async () => {
    const day = { v: '2026-11-16' };
    expect((await service(day).svc.receiveBook('nope')).ok).toBe(false);
    expect(await service(day).svc.receiveBook('kinematics-basics')).toEqual({ ok: false, error: 'not-ready' });
    expect(await service(day).svc.receiveBook('../etc')).toEqual({ ok: false, error: 'invalid-input' });
    expect(await service(day, null).svc.receiveBook('newton-laws')).toEqual({ ok: false, error: 'unauthenticated' });
  });

  it('walks a book through the schedule and logs counted reviews only', async () => {
    const day = { v: '2026-11-16' };
    const { svc, reviews, userBooks } = service(day);
    await svc.receiveBook('newton-laws');

    day.v = '2026-11-17';
    expect(await svc.reviewBook('newton-laws', 1)).toMatchObject({ ok: true, value: { stage: 1, dueOn: '2026-11-20', counted: true } });

    day.v = '2026-11-18'; // раньше срока — график не двигается
    expect(await svc.reviewBook('newton-laws', 1)).toMatchObject({ ok: true, value: { stage: 1, dueOn: '2026-11-20', counted: false } });

    day.v = '2026-11-20'; // вспомнил мало — шаг назад
    expect(await svc.reviewBook('newton-laws', 0.25)).toMatchObject({ ok: true, value: { stage: 0, dueOn: '2026-11-21', lapse: true } });

    // раннее повторение в журнал не пишется — иначе его можно слать бесконечно
    expect(reviews).toHaveLength(2);
    expect(reviews.every((r) => r.counted)).toBe(true);
    expect(userBooks.get('u1:b1')).toMatchObject({ reviewsCount: 2, lapses: 1 });
  });

  it('cannot review a book that was never received, or with a bad ratio', async () => {
    const day = { v: '2026-11-16' };
    const { svc } = service(day);
    expect(await svc.reviewBook('newton-laws', 1)).toEqual({ ok: false, error: 'not-received' });
    await svc.receiveBook('newton-laws');
    expect(await svc.reviewBook('newton-laws', 2)).toEqual({ ok: false, error: 'invalid-input' });
    expect(await svc.reviewBook('newton-laws', '1')).toEqual({ ok: false, error: 'invalid-input' });
  });

  it('reports a conflict when two reviews race', async () => {
    const day = { v: '2026-11-16' };
    const m = memoryRepo();
    const svc = createBookService({
      actorId: async () => 'u1',
      repo: { ...m.repo, updateUserBook: async () => false },
      today: () => day.v,
    });
    await svc.receiveBook('newton-laws');
    day.v = '2026-11-17';
    expect(await svc.reviewBook('newton-laws', 1)).toEqual({ ok: false, error: 'conflict' });
    expect(m.reviews).toHaveLength(0);
  });
});
