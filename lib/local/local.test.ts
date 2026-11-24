import { describe, expect, it } from 'vitest';
import { createBookService } from '@/lib/books/service';
import { createLocalBookRepository } from './book-repository';
import { buildBook, buildDueBooks, buildLibrary } from './library';
import { activityOn, activeDates, bestStreakOf, recordActivity, streakOf } from './activity';
import { decodeState, emptyState, encodeState, LocalStateTooLargeError, LOCAL_USER_ID, type LocalState } from './state';

const content = {
  'newton-laws': {
    ru: { pages: [{ title: 'Сила', blocks: [{ type: 'text', text: 'Сила — мера действия.' }] }] },
    kk: { pages: [{ title: 'Күш', blocks: [{ type: 'text', text: 'Күш — әсер өлшемі.' }] }] },
  },
} as const;
const lookup = (slug: string) => (content as Record<string, (typeof content)['newton-laws']>)[slug];

describe('local state cookie', () => {
  it('round-trips a full state', () => {
    const s: LocalState = {
      profile: { locale: 'kk', dailyGoal: 30, secondSubject: 'physics', examDate: '2027-06-20', targetScore: 90 },
      books: { 'newton-laws': { stage: 2, dueOn: '2026-11-25', receivedOn: '2026-11-18', reviewsCount: 2, lapses: 1 }, 'x-done': { stage: 7, dueOn: null, receivedOn: '2026-10-01', reviewsCount: 7, lapses: 0 } },
      activity: [{ date: '2026-11-17', problems: 12, lessons: 1, cards: 0 }, { date: '2026-11-18', problems: 3, lessons: 0, cards: 2 }],
      bestStreak: 9,
      tests: [{ date: '2026-11-17', kind: 'diagnostic', correct: 5, total: 8 }, { date: '2026-11-18', kind: 'full', correct: 21, total: 30 }],
    };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it('falls back to a clean state on missing or damaged data', () => {
    expect(decodeState(undefined)).toEqual(emptyState());
    expect(decodeState('not-base64-json')).toEqual(emptyState());
    expect(decodeState(Buffer.from('{"v":2}').toString('base64url'))).toEqual(emptyState());
    expect(decodeState(Buffer.from(JSON.stringify({ v: 1, p: [0, 20, 0, 0, 0], b: { '../etc': [0, 0, '2026-11-18', 0, 0] }, r: 0 })).toString('base64url'))).toEqual(emptyState());
  });

  it('holds dozens of books, and refuses what cannot fit one cookie', () => {
    const books: LocalState['books'] = {};
    for (let i = 0; i < 40; i++) books[`book-number-${i}`] = { stage: 1, dueOn: '2026-11-25', receivedOn: '2026-11-18', reviewsCount: 1, lapses: 0 };
    const s = { ...emptyState(), books };
    expect(decodeState(encodeState(s)).books).toEqual(books);
    for (let i = 40; i < 200; i++) books[`book-number-${i}`] = books['book-number-0'];
    expect(() => encodeState({ ...emptyState(), books })).toThrow(LocalStateTooLargeError);
  });

  it('reads an older cookie without activity fields as “no activity”', () => {
    const old = Buffer.from(JSON.stringify({ v: 1, p: [0, 20, 0, 0, 0], b: {}, r: 0 })).toString('base64url');
    expect(decodeState(old)).toEqual(emptyState());
  });
});

describe('activity and streak', () => {
  const day = (date: string) => ({ date, problems: 1, lessons: 0, cards: 0 });

  it('counts consecutive active days, and does not break the streak before the day is over', () => {
    const dates = ['2026-11-15', '2026-11-16', '2026-11-17'];
    expect(streakOf(dates, '2026-11-17')).toBe(3);
    expect(streakOf(dates, '2026-11-18')).toBe(3); // сегодня ещё ничего, но вчера было
    expect(streakOf(dates, '2026-11-19')).toBe(0); // пропущен целый день
    expect(streakOf([], '2026-11-18')).toBe(0);
    expect(streakOf(['2026-11-10', '2026-11-12', '2026-11-13'], '2026-11-13')).toBe(2);
  });

  it('records activity into today and keeps the best streak', () => {
    let s = emptyState();
    s = recordActivity(s, '2026-11-16', { problems: 2 });
    s = recordActivity(s, '2026-11-17', { lessons: 1 });
    s = recordActivity(s, '2026-11-17', { problems: 3, cards: 1 });
    expect(activityOn(s, '2026-11-17')).toEqual({ date: '2026-11-17', problems: 3, lessons: 1, cards: 1 });
    expect(activeDates(s)).toEqual(['2026-11-16', '2026-11-17']);
    expect(s.bestStreak).toBe(2);
    // перерыв: серия обнулилась, а рекорд остался
    s = recordActivity(s, '2026-11-20', { problems: 1 });
    expect(streakOf(activeDates(s), '2026-11-20')).toBe(1);
    expect(bestStreakOf(s, '2026-11-20')).toBe(2);
  });

  it('ignores negative deltas and keeps only the last three weeks', () => {
    let s = emptyState();
    s = recordActivity(s, '2026-11-01', { problems: 1 });
    s = recordActivity(s, '2026-11-18', { problems: -5 });
    expect(activityOn(s, '2026-11-18').problems).toBe(0);
    expect(s.activity.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-18']);
    s = recordActivity(s, '2026-11-25', { problems: 1 }); // 11-01 старше 21 дня
    expect(s.activity.map((d) => d.date)).toEqual(['2026-11-18', '2026-11-25']);
    expect(day('2026-11-18').date).toBe('2026-11-18');
  });
});

function setup(today: { v: string }) {
  let saved = emptyState();
  const repo = createLocalBookRepository({
    state: saved,
    save: async (s) => { saved = s; },
    catalog: (slug) => (slug === 'newton-laws' ? { hasContent: true } : slug === 'kinematics-basics' ? { hasContent: false } : null),
  });
  const svc = createBookService({ actorId: async () => LOCAL_USER_ID, repo, today: () => today.v, now: () => '2026-11-18T10:00:00Z' });
  return { svc, state: () => saved };
}

describe('local book repository behind the shared book service', () => {
  it('gives a book once and keeps it in the state', async () => {
    const day = { v: '2026-11-18' };
    const { svc, state } = setup(day);
    expect(await svc.receiveBook('newton-laws')).toEqual({ ok: true, value: { stage: 0, dueOn: '2026-11-19', isNew: true } });
    expect(await svc.receiveBook('newton-laws')).toEqual({ ok: true, value: { stage: 0, dueOn: '2026-11-19', isNew: false } });
    expect(state().books['newton-laws']).toEqual({ stage: 0, dueOn: '2026-11-19', receivedOn: '2026-11-18', reviewsCount: 0, lapses: 0 });
  });

  it('refuses unknown and unfinished books', async () => {
    const day = { v: '2026-11-18' };
    expect((await setup(day).svc.receiveBook('nope')).ok).toBe(false);
    expect(await setup(day).svc.receiveBook('kinematics-basics')).toEqual({ ok: false, error: 'not-ready' });
  });

  it('moves the schedule on review and counts the day', async () => {
    const day = { v: '2026-11-18' };
    const { svc, state } = setup(day);
    await svc.receiveBook('newton-laws');
    day.v = '2026-11-19';
    expect(await svc.reviewBook('newton-laws', 1)).toMatchObject({ ok: true, value: { stage: 1, dueOn: '2026-11-22', counted: true } });
    expect(state().books['newton-laws']).toMatchObject({ stage: 1, dueOn: '2026-11-22', reviewsCount: 1 });
    expect(activityOn(state(), '2026-11-19').cards).toBe(1);
    // слишком рано: график не сдвигается и не засчитывается в кольцо
    expect(await svc.reviewBook('newton-laws', 1)).toMatchObject({ ok: true, value: { stage: 1, counted: false } });
    expect(activityOn(state(), '2026-11-19').cards).toBe(1);
  });

  it('refuses a review before the book is received', async () => {
    expect(await setup({ v: '2026-11-18' }).svc.reviewBook('newton-laws', 1)).toEqual({ ok: false, error: 'not-received' });
  });
});

describe('local library', () => {
  const today = '2026-11-18';

  it('lists the catalog by subject and marks only written books as available', () => {
    const lib = buildLibrary({ locale: 'ru', state: emptyState(), today, content: lookup });
    expect(lib.map((s) => s.slug)).toEqual(['math', 'physics', 'informatics']);
    const books = lib.flatMap((s) => s.topics.flatMap((t) => t.books));
    expect(books.length).toBe(186);
    expect(books.filter((b) => b.state === 'available').map((b) => b.slug)).toEqual(['newton-laws']);
    expect(books.filter((b) => b.state === 'not-ready').length).toBe(185);
  });

  it('shows the state of a received book: scheduled, then due', () => {
    const state: LocalState = { ...emptyState(), books: { 'newton-laws': { stage: 0, dueOn: '2026-11-19', receivedOn: today, reviewsCount: 0, lapses: 0 } } };
    const find = (t: string) => buildLibrary({ locale: 'ru', state, today: t, content: lookup }).flatMap((s) => s.topics.flatMap((x) => x.books)).find((b) => b.slug === 'newton-laws');
    expect(find('2026-11-18')).toMatchObject({ received: true, state: 'scheduled', dueOn: '2026-11-19' });
    expect(find('2026-11-19')?.state).toBe('due');
  });

  it('returns a book with its content, falling back to Russian when Kazakh is missing', () => {
    const ru = buildBook({ slug: 'newton-laws', locale: 'ru', state: emptyState(), today, content: lookup });
    expect(ru?.content?.pages[0].title).toBe('Сила');
    expect(ru?.state).toBe('available');
    const kk = buildBook({ slug: 'newton-laws', locale: 'kk', state: emptyState(), today, content: lookup });
    expect(kk?.content?.pages[0].title).toBe('Күш');
    expect(kk?.contentFallback).toBe(false);
    const kkMissing = buildBook({ slug: 'newton-laws', locale: 'kk', state: emptyState(), today, content: () => ({ ru: content['newton-laws'].ru }) });
    expect(kkMissing?.contentFallback).toBe(true);
    expect(buildBook({ slug: 'no-such-book', locale: 'ru', state: emptyState(), today, content: lookup })).toBeNull();
  });

  it('lists due books oldest first with overdue days, and skips mastered or future ones', () => {
    const b = (stage: number, dueOn: string | null) => ({ stage, dueOn, receivedOn: '2026-11-01', reviewsCount: 0, lapses: 0 });
    const state: LocalState = {
      ...emptyState(),
      books: { 'newton-laws': b(1, '2026-11-16'), 'arithmetic-roots': b(2, '2026-11-18'), 'integer-powers': b(7, null), 'rational-powers': b(0, '2026-11-25') },
    };
    const due = buildDueBooks({ locale: 'ru', state, today });
    expect(due.map((d) => [d.slug, d.overdueDays])).toEqual([['newton-laws', 2], ['arithmetic-roots', 0]]);
  });
});
