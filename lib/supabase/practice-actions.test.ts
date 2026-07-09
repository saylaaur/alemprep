import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Идемпотентность finishExamSession: повторный вызов на уже завершённой
 * сессии не пересчитывает результат и НЕ начисляет XP/бонусы/достижения второй раз.
 *
 * Тест гоняет РЕАЛЬНУЮ серверную функцию против крошечного in-memory «Supabase»:
 * поддерживает ровно те цепочки, что использует finishExamSession.
 */

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;
type FailPoint = { table: string; op: 'delete' | 'insert' | 'update' | 'select'; message: string };

// Общий стор между моком ./server и телом теста.
const h = vi.hoisted(() => ({ store: {} as Store, failOnce: null as FailPoint | null }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./queries', () => ({ getPairExamBlocks: vi.fn() }));
vi.mock('./server', () => ({
  createClient: async () => makeClient(h.store),
}));

function makeClient(store: Store) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'U1' } }, error: null }),
    },
    from: (table: string) => builder(store, table),
  };
}

/** Минимальный чейнбилдер: select/insert/update + eq/in/is + maybeSingle/await. */
function builder(store: Store, table: string) {
  let op: 'delete' | 'select' | 'insert' | 'update' = 'select';
  let payload: Row | Row[] | null = null;
  const eqs: Array<[string, unknown]> = [];
  const ins: Array<[string, unknown[]]> = [];
  const iss: Array<[string, unknown]> = [];
  const rows = (): Row[] => (store[table] ??= []);

  const match = (r: Row) =>
    eqs.every(([c, v]) => r[c] === v) &&
    ins.every(([c, vs]) => vs.includes(r[c])) &&
    iss.every(([c, v]) => (v === null ? r[c] == null : r[c] === v));

  const run = (): { data: Row[]; error: { message: string } | null } => {
    if (h.failOnce?.table === table && h.failOnce.op === op) {
      const message = h.failOnce.message;
      h.failOnce = null;
      return { data: [], error: { message } };
    }
    const table_ = rows();
    if (op === 'insert') {
      const arr = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const inserted = arr.map((row, i) => ({ id: row.id ?? `${table}-${table_.length + i + 1}`, ...row }));
      for (const row of inserted) table_.push({ ...row });
      return { data: inserted.map((row) => ({ ...row })), error: null };
    }
    if (op === 'update') {
      const updated: Row[] = [];
      for (const r of table_) if (match(r)) { Object.assign(r, payload); updated.push(r); }
      return { data: updated.map((row) => ({ ...row })), error: null };
    }
    if (op === 'delete') {
      const deleted = table_.filter(match);
      store[table] = table_.filter((row) => !match(row));
      return { data: deleted.map((row) => ({ ...row })), error: null };
    }
    return { data: table_.filter(match).map((row) => ({ ...row })), error: null };
  };

  const api = {
    select: () => api,
    insert: (p: Row | Row[]) => ((op = 'insert'), (payload = p), api),
    update: (p: Row) => ((op = 'update'), (payload = p), api),
    delete: () => ((op = 'delete'), api),
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    in: (c: string, v: unknown[]) => (ins.push([c, v]), api),
    is: (c: string, v: unknown) => (iss.push([c, v]), api),
    maybeSingle: () => {
      const { data, error } = run();
      return Promise.resolve({ data: data[0] ?? null, error });
    },
    single: () => api.maybeSingle(),
    then: <T>(
      onF: (v: { data: Row[]; error: { message: string } | null }) => T,
      onR?: (e: unknown) => T
    ) => Promise.resolve(run()).then(onF, onR),
  };
  return api;
}

// Импортируем ПОСЛЕ регистрации моков.
import { finishExamSession, recordAttempt } from './practice-actions';

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
