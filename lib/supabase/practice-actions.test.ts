import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Идемпотентность finishExamSession: повторный вызов на уже завершённой
 * сессии не пересчитывает результат и НЕ начисляет XP/бонусы/достижения второй раз.
 *
 * Тест гоняет РЕАЛЬНУЮ серверную функцию против крошечного in-memory «Supabase»:
 * поддерживает ровно те цепочки, что использует finishExamSession.
 */

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

// Общий стор между моком ./server и телом теста.
const h = vi.hoisted(() => ({ store: {} as Store }));

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
  let op: 'select' | 'insert' | 'update' = 'select';
  let payload: Row | Row[] | null = null;
  const eqs: Array<[string, unknown]> = [];
  const ins: Array<[string, unknown[]]> = [];
  const iss: Array<[string, unknown]> = [];
  const rows = (): Row[] => (store[table] ??= []);

  const match = (r: Row) =>
    eqs.every(([c, v]) => r[c] === v) &&
    ins.every(([c, vs]) => vs.includes(r[c])) &&
    iss.every(([c, v]) => (v === null ? r[c] == null : r[c] === v));

  const run = (): { data: Row[]; error: null } => {
    const table_ = rows();
    if (op === 'insert') {
      const arr = Array.isArray(payload) ? payload : payload ? [payload] : [];
      for (const row of arr) table_.push({ ...row });
      return { data: arr, error: null };
    }
    if (op === 'update') {
      for (const r of table_) if (match(r)) Object.assign(r, payload);
      return { data: [], error: null };
    }
    return { data: table_.filter(match), error: null };
  };

  const api = {
    select: () => api,
    insert: (p: Row | Row[]) => ((op = 'insert'), (payload = p), api),
    update: (p: Row) => ((op = 'update'), (payload = p), api),
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    in: (c: string, v: unknown[]) => (ins.push([c, v]), api),
    is: (c: string, v: unknown) => (iss.push([c, v]), api),
    maybeSingle: () => {
      const { data, error } = run();
      return Promise.resolve({ data: data[0] ?? null, error });
    },
    single: () => api.maybeSingle(),
    then: <T>(
      onF: (v: { data: Row[]; error: null }) => T,
      onR?: (e: unknown) => T
    ) => Promise.resolve(run()).then(onF, onR),
  };
  return api;
}

// Импортируем ПОСЛЕ регистрации моков.
import { finishExamSession } from './practice-actions';

function seed(): Store {
  return {
    sessions: [
      { id: 'S1', user_id: 'U1', correct_count: null, score: null, finished_at: null },
    ],
    questions: [
      { id: 'Q1', type: 'single', body: { correct: 'A' }, topic_id: 'T1' },
      { id: 'Q2', type: 'single', body: { correct: 'B' }, topic_id: 'T1' },
    ],
    profiles: [{ id: 'U1', xp: 0, current_streak: 3 }],
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
    h.store = seed();
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
});
