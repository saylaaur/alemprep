import { describe, expect, it } from 'vitest';
import { emptyState, MAX_TEST_RESULTS } from './state';
import { bestOf, pickQuestions, recordTest, testPlan } from './tests';

const pool = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}` }));

describe('тесты без базы', () => {
  it('план: диагностика 8, неделя 10, пробник до 40 и не больше запаса', () => {
    expect(testPlan('diagnostic', 30)).toEqual({ kind: 'diagnostic', count: 8, seconds: 720 });
    expect(testPlan('weekly', 30)).toEqual({ kind: 'weekly', count: 10, seconds: 900 });
    expect(testPlan('full', 30)).toEqual({ kind: 'full', count: 30, seconds: 3600 });
    expect(testPlan('full', 100).count).toBe(40);
    expect(testPlan('weekly', 0)).toEqual({ kind: 'weekly', count: 0, seconds: 0 });
  });

  it('выбор вопросов стабилен, без повторов и зависит от seed', () => {
    const a = pickQuestions(pool, 8, '2026-11-18:diagnostic');
    expect(a).toHaveLength(8);
    expect(new Set(a.map((q) => q.id)).size).toBe(8);
    expect(pickQuestions(pool, 8, '2026-11-18:diagnostic')).toEqual(a);
    expect(pickQuestions(pool, 8, '2026-11-19:diagnostic')).not.toEqual(a);
    expect(pickQuestions(pool, 100, 's')).toHaveLength(30);
  });

  it('результат пишется, обрезается по границам и хранит только последние', () => {
    let s = emptyState();
    s = recordTest(s, { date: '2026-11-18', kind: 'weekly', correct: 99, total: 10 });
    expect(s.tests[0]).toEqual({ date: '2026-11-18', kind: 'weekly', correct: 10, total: 10 });
    for (let i = 0; i < 20; i++) s = recordTest(s, { date: '2026-11-18', kind: 'full', correct: i, total: 20 });
    expect(s.tests).toHaveLength(MAX_TEST_RESULTS);
    expect(s.tests.at(-1)?.correct).toBe(19);
  });

  it('лучший результат считается по доле', () => {
    const tests = [
      { date: 'd', kind: 'full' as const, correct: 20, total: 40 },
      { date: 'd', kind: 'full' as const, correct: 12, total: 20 },
      { date: 'd', kind: 'weekly' as const, correct: 10, total: 10 },
    ];
    expect(bestOf(tests, 'full')).toEqual(tests[1]);
    expect(bestOf(tests, 'diagnostic')).toBeNull();
  });
});
