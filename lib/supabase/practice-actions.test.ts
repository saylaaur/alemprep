import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QUESTION_POINTS } from '@/lib/exam';
import { makeClient, type Store, type FailPoint } from './testing/in-memory-db';

/**
 * Идемпотентность finishExamSession: повторный вызов на уже завершённой
 * сессии не пересчитывает результат и НЕ начисляет XP/бонусы/достижения второй раз.
 *
 * Тест гоняет РЕАЛЬНУЮ серверную функцию против крошечного in-memory «Supabase»
 * (lib/supabase/testing/in-memory-db.ts): поддерживает ровно те цепочки, что
 * использует finishExamSession.
 */

// Общий стор между моком ./server и телом теста.
const h = vi.hoisted(() => ({ store: {} as Store, failOnce: null as FailPoint | null }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./queries', () => ({ getPairExamBlocks: vi.fn() }));
vi.mock('./server', () => ({
  createClient: async () => makeClient(h),
}));

// Импортируем ПОСЛЕ регистрации моков.
import { finishExamSession, recordAttempt, verifyExamSessions } from './practice-actions';

function seed(): Store {
  return {
    sessions: [
      { id: 'S1', user_id: 'U1', correct_count: null, score: null, finished_at: null },
    ],
    questions: [
      { id: 'Q1', type: 'single', body: { correct: 'A' }, topic_id: 'T1' },
      { id: 'Q2', type: 'single', body: { correct: 'B' }, topic_id: 'T1' },
    ],
    profiles: [{
      id: 'U1',
      xp: 0,
      current_streak: 3,
      longest_streak: 3,
      last_active_date: '2026-07-03',
      streak_freezes: 1,
      last_freeze_used_date: null,
    }],
    attempts: [],
    user_achievements: [],
  };
}

const input = {
  sessionId: 'S1',
  results: [
    { questionId: 'Q1', givenAnswer: 'A', timeSpentMs: 1000 }, // верно
    { questionId: 'Q2', givenAnswer: 'wrong', timeSpentMs: 2000 }, // неверно
  ],
};

describe('finishExamSession — идемпотентность', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 4, 12, 0, 0));
    h.store = seed();
    h.failOnce = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('первый вызов завершает сессию и начисляет XP', async () => {
    const res = await finishExamSession(input);
    expect(res).toMatchObject({ ok: true, correctCount: 1 });

    const session = h.store.sessions[0];
    expect(session.finished_at).toBeTruthy();
    expect(session.correct_count).toBe(1);

    expect(h.store.attempts).toHaveLength(2);
    expect((h.store.profiles[0].xp as number)).toBeGreaterThan(0);
  });

  it('завершение пробника считается активностью дня и продлевает стрик', async () => {
    const res = await finishExamSession(input);

    expect(res).toMatchObject({ ok: true });
    expect(h.store.profiles[0]).toMatchObject({
      current_streak: 4,
      longest_streak: 4,
      last_active_date: '2026-07-04',
    });
  });

  it('если запись попыток падает, сессия остаётся незавершённой для повторной отправки', async () => {
    h.failOnce = { table: 'attempts', op: 'insert', message: 'insert failed' };

    const res = await finishExamSession(input);

    expect(res).toEqual({ error: 'insert failed' });
    expect(h.store.sessions[0]).toMatchObject({
      correct_count: null,
      score: null,
      finished_at: null,
    });
    expect(h.store.attempts).toHaveLength(0);
    expect(h.store.profiles[0]).toMatchObject({
      xp: 0,
      current_streak: 3,
      last_active_date: '2026-07-03',
    });
  });

  it('если обновление профиля падает, попытки откатываются и повторная отправка не задублирует их', async () => {
    h.failOnce = { table: 'profiles', op: 'update', message: 'profile failed' };

    const res = await finishExamSession(input);

    expect(res).toEqual({ error: 'profile failed' });
    expect(h.store.sessions[0]).toMatchObject({
      correct_count: null,
      score: null,
      finished_at: null,
    });
    expect(h.store.attempts).toHaveLength(0);
    expect(h.store.profiles[0]).toMatchObject({
      xp: 0,
      current_streak: 3,
      last_active_date: '2026-07-03',
    });
  });

  it('повторный вызов ничего не пересчитывает и не начисляет заново', async () => {
    const first = await finishExamSession(input);

    const xpAfterFirst = h.store.profiles[0].xp;
    const attemptsAfterFirst = h.store.attempts.length;
    const achievementsAfterFirst = h.store.user_achievements.length;
    const finishedAtAfterFirst = h.store.sessions[0].finished_at;

    const second = await finishExamSession(input);

    // Тот же результат.
    expect(second).toEqual(first);
    // Никаких побочных эффектов от второго вызова.
    expect(h.store.profiles[0].xp).toBe(xpAfterFirst);
    expect(h.store.attempts).toHaveLength(attemptsAfterFirst);
    expect(h.store.user_achievements).toHaveLength(achievementsAfterFirst);
    expect(h.store.sessions[0].finished_at).toBe(finishedAtAfterFirst);
  });

  it('блок с неотвеченными вопросами завершается, попытки пишутся только по отвеченным', async () => {
    const res = await finishExamSession({
      sessionId: 'S1',
      results: [
        { questionId: 'Q1', givenAnswer: 'A', timeSpentMs: 1000 }, // отвечен, верно
        { questionId: 'Q2', givenAnswer: null, timeSpentMs: 1000 }, // не отвечен
      ],
    });

    // Балл считается по ВСЕМ вопросам (неотвеченный = 0 баллов).
    expect(res).toMatchObject({ ok: true, correctCount: 1, score: QUESTION_POINTS.single });
    expect(h.store.sessions[0].finished_at).toBeTruthy();
    // В attempts — только отвеченные (given_answer в схеме NOT NULL).
    expect(h.store.attempts).toHaveLength(1);
    expect(h.store.attempts[0]).toMatchObject({ question_id: 'Q1', is_correct: true });
  });

  it('несуществующая/чужая сессия — ошибка, без записи попыток', async () => {
    const res = await finishExamSession({ ...input, sessionId: 'NOPE' });
    expect(res).toEqual({ error: 'session not found' });
    expect(h.store.attempts).toHaveLength(0);
  });

  it('второй блок пробника в тот же день не двигает стрик повторно', async () => {
    // Вторая сессия того же пробника (второй предмет пары).
    h.store.sessions.push({
      id: 'S2', user_id: 'U1', correct_count: null, score: null, finished_at: null,
    });

    await finishExamSession(input); // блок 1: стрик 3 → 4 (2026-07-03 → 2026-07-04)
    await finishExamSession({ ...input, sessionId: 'S2' }); // блок 2, тот же день → без изменений

    expect(h.store.profiles[0]).toMatchObject({
      current_streak: 4,
      last_active_date: '2026-07-04',
    });
  });

  it('пропущен ровно один день, есть заморозка — стрик растёт, заморозка списывается', async () => {
    h.store.profiles[0].last_active_date = '2026-07-02';
    h.store.profiles[0].streak_freezes = 1;

    const res = await finishExamSession(input);

    expect(res).toMatchObject({ ok: true });
    expect(h.store.profiles[0]).toMatchObject({
      current_streak: 4,
      last_active_date: '2026-07-04',
      streak_freezes: 0,
      last_freeze_used_date: '2026-07-04',
    });
  });

  it('пропущен день, заморозок нет — обычный сброс серии в 1', async () => {
    h.store.profiles[0].last_active_date = '2026-07-02';
    h.store.profiles[0].streak_freezes = 0;

    const res = await finishExamSession(input);

    expect(res).toMatchObject({ ok: true });
    expect(h.store.profiles[0]).toMatchObject({
      current_streak: 1,
      last_active_date: '2026-07-04',
      streak_freezes: 0,
    });
    expect(h.store.profiles[0].last_freeze_used_date).toBeNull();
  });

  it('гонка: параллельный (Promise.all) двойной вызов на одной сессии не дублирует XP/попытки', async () => {
    // Реалистичный сценарий: двойной клик на «Завершить», или ретрай сети,
    // отправляющий второй запрос до того, как первый успел проставить
    // finished_at. Условный UPDATE (finished_at IS NULL) должен гарантировать,
    // что только один из двух вызовов реально проведёт побочные эффекты.
    const [a, b] = await Promise.all([finishExamSession(input), finishExamSession(input)]);

    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: true, correctCount: 1 });

    expect(h.store.sessions).toHaveLength(1);
    expect(h.store.sessions[0].finished_at).toBeTruthy();
    // Попытки вставлены только один раз (победителем гонки), не задвоены.
    expect(h.store.attempts).toHaveLength(2);
    // XP начислен один раз: 1 верный × 10 + бонус за блок 50 = 60.
    expect(h.store.profiles[0].xp).toBe(60);
  });
});

describe('verifyExamSessions — принадлежность сессий текущему пользователю', () => {
  beforeEach(() => {
    h.store = seed();
    h.failOnce = null;
  });

  it('свои сессии → ok', async () => {
    expect(await verifyExamSessions(['S1'])).toEqual({ ok: true });
  });

  it('чужая сессия в списке → не ok (восстановление надо отбросить)', async () => {
    h.store.sessions.push({
      id: 'S-foreign', user_id: 'U2', correct_count: null, score: null, finished_at: null,
    });

    expect(await verifyExamSessions(['S1', 'S-foreign'])).toEqual({ ok: false });
  });

  it('несуществующая сессия → не ok', async () => {
    expect(await verifyExamSessions(['S1', 'NOPE'])).toEqual({ ok: false });
  });

  it('пустой список → не ok', async () => {
    expect(await verifyExamSessions([])).toEqual({ ok: false });
  });
});

describe('recordAttempt — сохранение прогресса', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 4, 12, 0, 0));
    h.store = seed();
    h.failOnce = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('верный ответ начисляет +10 XP и сохраняет попытку как верную', async () => {
    const res = await recordAttempt({
      questionId: 'Q1',
      givenAnswer: 'A',
      isCorrect: true,
      timeSpentMs: 1000,
    });

    expect(res).toEqual({ ok: true, xpAwarded: 10 });
    expect(h.store.profiles[0].xp).toBe(10);
    expect(h.store.attempts).toHaveLength(1);
    expect(h.store.attempts[0]).toMatchObject({
      question_id: 'Q1',
      is_correct: true,
    });
  });

  it('неверный ответ не начисляет XP, но попытка сохраняется', async () => {
    const res = await recordAttempt({
      questionId: 'Q2',
      givenAnswer: 'wrong',
      isCorrect: false,
      timeSpentMs: 1000,
    });

    expect(res).toEqual({ ok: true, xpAwarded: 0 });
    expect(h.store.profiles[0].xp).toBe(0);
    expect(h.store.attempts).toHaveLength(1);
    expect(h.store.attempts[0]).toMatchObject({
      question_id: 'Q2',
      is_correct: false,
    });
  });

  it('пропущен ровно один день, есть заморозка — стрик растёт, заморозка списывается', async () => {
    h.store.profiles[0].last_active_date = '2026-07-02';
    h.store.profiles[0].streak_freezes = 1;

    const res = await recordAttempt({
      questionId: 'Q1',
      givenAnswer: 'A',
      isCorrect: true,
      timeSpentMs: 1000,
    });

    expect(res).toEqual({ ok: true, xpAwarded: 10 });
    expect(h.store.profiles[0]).toMatchObject({
      current_streak: 4,
      last_active_date: '2026-07-04',
      streak_freezes: 0,
      last_freeze_used_date: '2026-07-04',
    });
  });

  it('если обновление профиля падает, попытка откатывается и клиент видит ошибку', async () => {
    h.failOnce = { table: 'profiles', op: 'update', message: 'profile failed' };

    const res = await recordAttempt({
      questionId: 'Q1',
      givenAnswer: 'A',
      isCorrect: true,
      timeSpentMs: 1000,
    });

    expect(res).toEqual({ ok: false, error: 'profile failed' });
    expect(h.store.attempts).toHaveLength(0);
    expect(h.store.profiles[0]).toMatchObject({
      xp: 0,
      current_streak: 3,
      last_active_date: '2026-07-03',
    });
    expect(h.store.user_achievements).toHaveLength(0);
  });
});
