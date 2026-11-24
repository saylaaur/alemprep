import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Cookie-хранилище в памяти вместо next/headers: проверяем настоящий путь «действие → cookie → страница».
const h = vi.hoisted(() => ({ jar: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name)! } : undefined),
    set: (name: string, value: string) => void h.jar.set(name, value),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    throw new Error('Supabase must not be used in local mode');
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('Supabase admin must not be used in local mode');
  },
}));

import { receiveBookAction, reviewBookAction } from '@/lib/supabase/book-actions';
import { updateProfileSettings } from '@/lib/supabase/profile-actions';
import { getActor } from '@/lib/server/actor';
import { getProfile } from '@/lib/supabase/queries';
import { getBook, getBookReviewsToday, getLibrary } from '@/lib/supabase/queries/books';
import { POST as postActivity } from '@/app/api/local/activity/route';
import { POST as postTest } from '@/app/api/local/test/route';
import { readLocalState } from './store';
import { activityOn } from './activity';
import { localDateStr } from '@/lib/streak';
import { LOCAL_USER_ID } from './state';

beforeEach(() => {
  h.jar.clear();
  vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'local');
});
afterEach(() => vi.unstubAllEnvs());

describe('local mode end to end (no Supabase)', () => {
  it('a standalone guest does not become a hosted actor', async () => {
    expect(await getActor()).toBeNull();
  });

  it('receives a book, shows it in the library and the book page', async () => {
    const r = await receiveBookAction('newton-laws');
    expect(r.ok).toBe(true);
    expect((await readLocalState()).books['newton-laws']).toBeDefined();

    const book = await getBook('newton-laws', 'ru');
    expect(book).toMatchObject({ received: true, state: 'scheduled' });
    const lib = await getLibrary('ru');
    const found = lib.flatMap((s) => s.topics.flatMap((t) => t.books)).find((b) => b.slug === 'newton-laws');
    expect(found).toMatchObject({ received: true, state: 'scheduled' });
  });

  it('answers “not ready” for a book without a written text', async () => {
    expect(await receiveBookAction('arithmetic-roots')).toEqual({ ok: false, error: 'not-ready' });
  });

  it('rejects a review of a book that was never received', async () => {
    expect(await reviewBookAction('newton-laws', 1)).toEqual({ ok: false, error: 'not-received' });
    expect(await getBookReviewsToday(LOCAL_USER_ID, 'ru')).toEqual({ due: [], reviewedToday: 0 });
  });

  it('saves settings in the cookie and builds the profile from them', async () => {
    expect(await getProfile()).toMatchObject({ id: LOCAL_USER_ID, daily_goal: 20, exam_date: null });
    expect(await updateProfileSettings({ dailyGoal: 35, examDate: '2027-06-20', targetScore: 90, locale: 'kk', secondSubject: 'physics' })).toEqual({ ok: true });
    expect(await getProfile()).toMatchObject({ daily_goal: 35, exam_date: '2027-06-20', target_score: 90, locale: 'kk', second_subject: 'physics' });
  });

  it('keeps books and settings together in one cookie', async () => {
    await receiveBookAction('newton-laws');
    await updateProfileSettings({ dailyGoal: 40 });
    const s = await readLocalState();
    expect(s.profile.dailyGoal).toBe(40);
    expect(Object.keys(s.books)).toEqual(['newton-laws']);
    expect(h.jar.size).toBe(1);
  });
});

describe('local activity route', () => {
  const call = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    postActivity(new Request('http://localhost/api/local/activity', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));

  it('records problems and lessons for today and returns the streak', async () => {
    expect(await (await call({ kind: 'lesson' })).json()).toEqual({ ok: true, streak: 1 });
    await call({ kind: 'problem' });
    await call({ kind: 'problem' });
    const today = activityOn(await readLocalState(), localDateStr());
    expect(today).toMatchObject({ problems: 2, lessons: 1, cards: 0 });
  });

  it('does not count receiving a book as a study activity', async () => {
    await receiveBookAction('newton-laws');
    expect((await readLocalState()).activity).toEqual([]); // получить книгу — ещё не занятие
  });

  it('refuses unknown kinds, non-JSON bodies and any use outside local mode', async () => {
    expect((await call({ kind: 'xp' })).status).toBe(400);
    expect((await call({ kind: 'constructor' })).status).toBe(400);
    expect((await call('kind=problem', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await call('not json')).status).toBe(400);
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', '');
    expect((await call({ kind: 'problem' })).status).toBe(404);
    expect(h.jar.size).toBe(0);
  });
});


describe('local test route', () => {
  const call = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    postTest(new Request('http://localhost/api/local/test', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));

  it('saves the result and counts solved questions as today’s problems', async () => {
    expect((await call({ kind: 'diagnostic', correct: 5, total: 8 })).status).toBe(200);
    const s = await readLocalState();
    expect(s.tests).toEqual([{ date: localDateStr(), kind: 'diagnostic', correct: 5, total: 8 }]);
    expect(activityOn(s, localDateStr())).toMatchObject({ problems: 8 });
  });

  it('refuses nonsense, non-JSON bodies and any use outside local mode', async () => {
    expect((await call({ kind: 'exam', correct: 1, total: 2 })).status).toBe(400);
    expect((await call({ kind: 'full', correct: 9, total: 8 })).status).toBe(400);
    expect((await call({ kind: 'full', correct: -1, total: 8 })).status).toBe(400);
    expect((await call({ kind: 'full', correct: 1.5, total: 8 })).status).toBe(400);
    expect((await call({ kind: 'full', correct: 1, total: 9999 })).status).toBe(400);
    expect((await call('x', { 'content-type': 'text/plain' })).status).toBe(415);
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', '');
    expect((await call({ kind: 'full', correct: 1, total: 8 })).status).toBe(404);
    expect(h.jar.size).toBe(0);
  });
});
