import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QUESTION_POINTS } from '@/lib/exam';
import { nextIsoWeekMonday } from '@/lib/weekly';
import { makeClient, type Store, type FailPoint } from './testing/in-memory-db';
import type { Question } from '@/types/db';

const h = vi.hoisted(() => ({ store: {} as Store, failOnce: null as FailPoint | null }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./queries', () => ({ getPairExamBlocks: vi.fn() }));
vi.mock('./server', () => ({
  createClient: async () => makeClient(h),
}));

// Импортируем ПОСЛЕ регистрации моков.
import { getPairExamBlocks } from './queries';
import { startWeeklyTest, finishWeeklyTest } from './weekly-actions';

function seed(): Store {
  return {
    profiles: [{
      id: 'U1',
      second_subject: 'physics',
      xp: 0,
      current_streak: 3,
      longest_streak: 3,
      last_active_date: '2026-07-03',
      streak_freezes: 1,
      last_freeze_used_date: null,
    }],
    sessions: [
      {
        id: 'S1', user_id: 'U1', mode: 'weekly', correct_count: null, score: null,
        finished_at: null, started_at: '2026-07-04T10:00:00.000Z',
      },
    ],
    questions: [
      { id: 'Q1', type: 'single', body: { correct: 'A' }, topic_id: 'T1' },
      { id: 'Q2', type: 'single', body: { correct: 'B' }, topic_id: 'T1' },
    ],
    attempts: [],
  };
}

const input = {
  sessionId: 'S1',
  results: [
    { questionId: 'Q1', givenAnswer: 'A', timeSpentMs: 1000 }, // верно
    { questionId: 'Q2', givenAnswer: 'wrong', timeSpentMs: 2000 }, // неверно
  ],
};

describe('finishWeeklyTest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 4, 12, 0, 0)); // 2026-07-04, 12:00 local
    h.store = seed();
    h.failOnce = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('первый вызов завершает сессию, начисляет XP и продлевает стрик', async () => {
    const res = await finishWeeklyTest(input);

    expect(res).toMatchObject({ ok: true, correctCount: 1, score: QUESTION_POINTS.single });
    expect(h.store.sessions[0].finished_at).toBeTruthy();
    expect(h.store.attempts).toHaveLength(2);
    // 1 верный × 10 + WEEKLY_TEST_BONUS (30) = 40.
    expect(h.store.profiles[0].xp).toBe(40);
    expect(h.store.profiles[0]).toMatchObject({
      current_streak: 4,
      last_active_date: '2026-07-04',
    });
  });

  it('повторный вызов ничего не пересчитывает и не начисляет заново', async () => {
    const first = await finishWeeklyTest(input);
    const second = await finishWeeklyTest(input);

    expect(second).toEqual(first);
    expect(h.store.attempts).toHaveLength(2);
    expect(h.store.profiles[0].xp).toBe(40);
  });

  it('несуществующая/чужая сессия — ошибка, без записи попыток', async () => {
    const res = await finishWeeklyTest({ ...input, sessionId: 'NOPE' });
    expect(res).toEqual({ error: 'session not found' });
    expect(h.store.attempts).toHaveLength(0);
  });

  it('сессия не в режиме weekly — ошибка', async () => {
    h.store.sessions.push({
      id: 'S-diag', user_id: 'U1', mode: 'diagnostic', correct_count: null, score: null,
      finished_at: null, started_at: '2026-07-04T10:00:00.000Z',
    });
    const res = await finishWeeklyTest({ ...input, sessionId: 'S-diag' });
    expect(res).toEqual({ error: 'wrong session mode' });
  });

  it('неотвеченные вопросы: балл по всем, attempts только по отвеченным', async () => {
    const res = await finishWeeklyTest({
      sessionId: 'S1',
      results: [
        { questionId: 'Q1', givenAnswer: 'A', timeSpentMs: 1000 },
        { questionId: 'Q2', givenAnswer: null, timeSpentMs: 1000 },
      ],
    });

    expect(res).toMatchObject({ ok: true, correctCount: 1, score: QUESTION_POINTS.single });
    expect(h.store.attempts).toHaveLength(1);
    expect(h.store.attempts[0]).toMatchObject({ question_id: 'Q1', is_correct: true });
  });

  it('если запись попыток падает, сессия остаётся незавершённой, XP не начислен', async () => {
    h.failOnce = { table: 'attempts', op: 'insert', message: 'insert failed' };

    const res = await finishWeeklyTest(input);

    expect(res).toEqual({ error: 'insert failed' });
    expect(h.store.sessions[0]).toMatchObject({ correct_count: null, score: null, finished_at: null });
    expect(h.store.attempts).toHaveLength(0);
    expect(h.store.profiles[0].xp).toBe(0);
  });

  it('если обновление профиля падает, попытки и сессия откатываются', async () => {
    h.failOnce = { table: 'profiles', op: 'update', message: 'profile failed' };

    const res = await finishWeeklyTest(input);

    expect(res).toEqual({ error: 'profile failed' });
    expect(h.store.sessions[0]).toMatchObject({ correct_count: null, score: null, finished_at: null });
    expect(h.store.attempts).toHaveLength(0);
    expect(h.store.profiles[0]).toMatchObject({ xp: 0, current_streak: 3 });
  });

  it('гонка: параллельный двойной вызов не дублирует XP/попытки', async () => {
    const [a, b] = await Promise.all([finishWeeklyTest(input), finishWeeklyTest(input)]);

    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: true, correctCount: 1 });
    expect(h.store.attempts).toHaveLength(2);
    expect(h.store.profiles[0].xp).toBe(40);
  });
});

describe('startWeeklyTest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 6, 9, 0, 0)); // Monday 2026-07-06 — same ISO week as S1
    h.store = { profiles: [{ id: 'U1', second_subject: 'physics' }], sessions: [], attempts: [] };
    h.failOnce = null;
    vi.mocked(getPairExamBlocks).mockReset();
    vi.mocked(getPairExamBlocks).mockResolvedValue({
      blocks: [
        {
          subjectSlug: 'math', subjectId: 'SM', name_ru: 'Математика', name_kk: 'Математика',
          topics: [], questions: [{ id: 'Q1' } as Question], shortfall: [],
        },
        {
          subjectSlug: 'physics', subjectId: 'SP', name_ru: 'Физика', name_kk: 'Физика',
          topics: [], questions: [{ id: 'Q2' } as Question], shortfall: [],
        },
      ],
      contexts: new Map(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('нет second_subject в профиле — ошибка', async () => {
    h.store.profiles = [{ id: 'U1', second_subject: null }];
    const res = await startWeeklyTest({ locale: 'ru' });
    expect(res).toEqual({ error: 'no_second_subject' });
    expect(h.store.sessions).toHaveLength(0);
  });

  it('уже есть weekly-сессия на этой ISO-неделе — ошибка с датой следующего теста', async () => {
    h.store.sessions = [
      {
        id: 'S1', user_id: 'U1', mode: 'weekly', correct_count: 5, score: 5,
        finished_at: '2026-07-06T09:00:00.000Z', started_at: '2026-07-06T09:00:00.000Z',
      },
    ];

    const res = await startWeeklyTest({ locale: 'ru' });

    expect(res).toMatchObject({ error: 'already-done-this-week' });
    expect((res as { nextAvailableAt: string }).nextAvailableAt).toBe(
      nextIsoWeekMonday(new Date(2026, 6, 6, 9, 0, 0)).toISOString()
    );
    expect(h.store.sessions).toHaveLength(1); // не создал вторую сессию
  });

  it('weekly-сессия на прошлой неделе не блокирует новый тест', async () => {
    h.store.sessions = [
      {
        id: 'S-prev', user_id: 'U1', mode: 'weekly', correct_count: 5, score: 5,
        finished_at: '2026-06-29T09:00:00.000Z', started_at: '2026-06-29T09:00:00.000Z',
      },
    ];

    const res = await startWeeklyTest({ locale: 'ru' });

    expect(res).toMatchObject({ sessionId: expect.any(String) });
    expect(h.store.sessions).toHaveLength(2);
  });

  it('создаёт ровно одну сессию с subject_id null и mode weekly', async () => {
    const res = await startWeeklyTest({ locale: 'ru' });

    expect(res).toMatchObject({ sessionId: expect.any(String) });
    expect(h.store.sessions).toHaveLength(1);
    expect(h.store.sessions[0]).toMatchObject({
      user_id: 'U1',
      mode: 'weekly',
      subject_id: null,
      total_questions: 2,
    });
  });

  it('передаёт в getPairExamBlocks WEEKLY_BLUEPRINT и picker, исключающий уже отвеченные вопросы', async () => {
    h.store.attempts = [{ id: 'A1', user_id: 'U1', question_id: 'SEEN' }];

    await startWeeklyTest({ locale: 'ru' });

    const call = vi.mocked(getPairExamBlocks).mock.calls[0];
    expect(call[2]).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'single' })]));
    const pick = call[3];
    expect(typeof pick).toBe('function');

    const pool = [
      { id: 'SEEN', type: 'single', topic_id: 'T1' } as Question,
      { id: 'FRESH', type: 'single', topic_id: 'T1' } as Question,
    ];
    const { picked } = pick!(pool, [{ type: 'single', count: 1, points: 1 }]);
    expect(picked.map((p) => p.id)).toEqual(['FRESH']);
  });
});
