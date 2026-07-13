import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QUESTION_POINTS } from '@/lib/exam';
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
import { startDiagnostic, finishDiagnostic } from './diagnostic-actions';

function seed(): Store {
  return {
    profiles: [{ id: 'U1', second_subject: 'physics' }],
    sessions: [
      { id: 'S1', user_id: 'U1', mode: 'diagnostic', correct_count: null, score: null, finished_at: null },
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

describe('finishDiagnostic', () => {
  beforeEach(() => {
    h.store = seed();
    h.failOnce = null;
  });

  it('первый вызов завершает сессию, без XP/стрика/достижений', async () => {
    const res = await finishDiagnostic(input);

    expect(res).toMatchObject({ ok: true, correctCount: 1, score: QUESTION_POINTS.single });
    expect(h.store.sessions[0].finished_at).toBeTruthy();
    expect(h.store.attempts).toHaveLength(2);
    // Диагностика не трогает profiles вообще.
    expect(h.store.profiles[0]).toEqual({ id: 'U1', second_subject: 'physics' });
  });

  it('повторный вызов ничего не пересчитывает', async () => {
    const first = await finishDiagnostic(input);
    const second = await finishDiagnostic(input);

    expect(second).toEqual(first);
    expect(h.store.attempts).toHaveLength(2);
  });

  it('несуществующая/чужая сессия — ошибка, без записи попыток', async () => {
    const res = await finishDiagnostic({ ...input, sessionId: 'NOPE' });
    expect(res).toEqual({ error: 'session not found' });
    expect(h.store.attempts).toHaveLength(0);
  });

  it('сессия не в режиме diagnostic — ошибка', async () => {
    h.store.sessions.push({
      id: 'S-exam', user_id: 'U1', mode: 'mock_exam', correct_count: null, score: null, finished_at: null,
    });
    const res = await finishDiagnostic({ ...input, sessionId: 'S-exam' });
    expect(res).toEqual({ error: 'wrong session mode' });
  });

  it('неотвеченные вопросы: балл по всем, attempts только по отвеченным', async () => {
    const res = await finishDiagnostic({
      sessionId: 'S1',
      results: [
        { questionId: 'Q1', givenAnswer: 'A', timeSpentMs: 1000 },
        { questionId: 'Q2', givenAnswer: null, timeSpentMs: 1000 },
      ],
    });

    expect(res).toMatchObject({ ok: true, correctCount: 1, score: QUESTION_POINTS.single });
    expect(h.store.sessions[0].finished_at).toBeTruthy();
    expect(h.store.attempts).toHaveLength(1);
    expect(h.store.attempts[0]).toMatchObject({ question_id: 'Q1', is_correct: true });
  });

  it('если запись попыток падает, сессия остаётся незавершённой', async () => {
    h.failOnce = { table: 'attempts', op: 'insert', message: 'insert failed' };

    const res = await finishDiagnostic(input);

    expect(res).toEqual({ error: 'insert failed' });
    expect(h.store.sessions[0]).toMatchObject({ correct_count: null, score: null, finished_at: null });
    expect(h.store.attempts).toHaveLength(0);
  });

  it('гонка: параллельный двойной вызов не дублирует попытки', async () => {
    const [a, b] = await Promise.all([finishDiagnostic(input), finishDiagnostic(input)]);

    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: true, correctCount: 1 });
    expect(h.store.attempts).toHaveLength(2);
  });
});

describe('startDiagnostic', () => {
  beforeEach(() => {
    h.store = { profiles: [{ id: 'U1', second_subject: 'physics' }], sessions: [] };
    h.failOnce = null;
    vi.mocked(getPairExamBlocks).mockReset();
  });

  it('нет second_subject в профиле — ошибка', async () => {
    h.store.profiles = [{ id: 'U1', second_subject: null }];
    const res = await startDiagnostic({ locale: 'ru' });
    expect(res).toEqual({ error: 'no_second_subject' });
    expect(h.store.sessions).toHaveLength(0);
  });

  it('создаёт ровно одну сессию с subject_id null и mode diagnostic', async () => {
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

    const res = await startDiagnostic({ locale: 'ru' });

    expect(res).toMatchObject({ sessionId: expect.any(String) });
    expect(h.store.sessions).toHaveLength(1);
    expect(h.store.sessions[0]).toMatchObject({
      user_id: 'U1',
      mode: 'diagnostic',
      subject_id: null,
      total_questions: 2,
    });
  });
});
