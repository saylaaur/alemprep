import { MAX_TEST_RESULTS, type LocalState, type TestKind, type TestResult } from './state';

/**
 * Тесты без базы: диагностика, недельный тест и полный пробник из вопросов уроков.
 * Чистая логика (выбор вопросов, время, запись результата) — без React и cookie.
 */
export type TestPlan = { kind: TestKind; count: number; seconds: number };

const CONFIG: Record<TestKind, { count: number; secondsPerQuestion: number }> = {
  diagnostic: { count: 8, secondsPerQuestion: 90 },
  weekly: { count: 10, secondsPerQuestion: 90 },
  // В настоящем ЕНТ — 40 заданий на 80 минут, то есть по 2 минуты на задание.
  full: { count: 40, secondsPerQuestion: 120 },
};

/** Сколько вопросов и времени у теста, если в запасе `poolSize` вопросов. */
export function testPlan(kind: TestKind, poolSize: number): TestPlan {
  const c = CONFIG[kind];
  const count = Math.max(0, Math.min(c.count, poolSize));
  return { kind, count, seconds: count * c.secondsPerQuestion };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Детерминированный выбор: при одном `seed` на сервере и клиенте получится один и тот же набор. */
export function pickQuestions<T extends { id: string }>(pool: readonly T[], count: number, seed: string): T[] {
  return [...pool]
    .map((q) => ({ q, k: hash(`${seed}:${q.id}`) }))
    .sort((a, b) => a.k - b.k || a.q.id.localeCompare(b.q.id))
    .slice(0, Math.max(0, count))
    .map((x) => x.q);
}

/** Добавить результат; в cookie помним только последние MAX_TEST_RESULTS. */
export function recordTest(state: LocalState, result: TestResult): LocalState {
  const correct = Math.max(0, Math.min(Math.trunc(result.correct), Math.trunc(result.total)));
  const next: TestResult = { ...result, correct, total: Math.trunc(result.total) };
  return { ...state, tests: [...state.tests, next].slice(-MAX_TEST_RESULTS) };
}

/** Лучший результат (по доле верных) среди тестов этого вида. */
export function bestOf(tests: readonly TestResult[], kind: TestKind): TestResult | null {
  let best: TestResult | null = null;
  for (const t of tests) {
    if (t.kind !== kind || t.total === 0) continue;
    if (!best || t.correct / t.total > best.correct / best.total) best = t;
  }
  return best;
}
