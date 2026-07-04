import { describe, it, expect } from 'vitest';
import {
  scoreAnswer,
  pickBalancedByTopic,
  EXAM_MAX_SCORE,
  EXAM_PAIR_MAX_SCORE,
  EXAM_PAIR_DURATION_S,
  EXAM_BLUEPRINT,
  QUESTION_POINTS,
} from './exam';
import type { QuestionBody, QuestionType } from '@/types/db';

const singleBody: QuestionBody = {
  stem: '2+2?',
  options: [
    { id: 'a', content: '3' },
    { id: 'b', content: '4' },
    { id: 'c', content: '5' },
  ],
  correct: 'b',
} as QuestionBody;

const multiBody: QuestionBody = {
  stem: 'чётные?',
  options: [
    { id: 'a', content: '1' },
    { id: 'b', content: '2' },
    { id: 'c', content: '4' },
    { id: 'd', content: '5' },
    { id: 'e', content: '6' },
  ],
  correct: ['b', 'c', 'e'],
} as QuestionBody;

const matchingBody: QuestionBody = {
  stem: 'сопоставь',
  left: [
    { id: 'a', content: 'ln e' },
    { id: 'b', content: 'ln 1' },
    { id: 'c', content: 'ln e^2' },
  ],
  right: ['0', '1', '2'],
  correct: { a: '1', b: '0', c: '2' },
} as QuestionBody;

describe('scoreAnswer: константы формата', () => {
  it('максимум 55 баллов: 25×1 + 10×2 + 5×2', () => {
    expect(EXAM_MAX_SCORE).toBe(55);
    expect(QUESTION_POINTS).toEqual({ single: 1, multi: 2, matching: 2 });
  });
  it('пара: 110 баллов, 160 минут', () => {
    expect(EXAM_PAIR_MAX_SCORE).toBe(110);
    expect(EXAM_PAIR_DURATION_S).toBe(160 * 60);
  });
});

// ---- pickBalancedByTopic ----

type PoolItem = { id: string; type: QuestionType; topic_id: string };

function makePool(
  spec: Record<string, Partial<Record<QuestionType, number>>>
): PoolItem[] {
  const pool: PoolItem[] = [];
  for (const [topic, types] of Object.entries(spec)) {
    for (const [type, n] of Object.entries(types) as [QuestionType, number][]) {
      for (let i = 0; i < n; i++) {
        pool.push({ id: `${topic}-${type}-${i}`, type, topic_id: topic });
      }
    }
  }
  return pool;
}

describe('pickBalancedByTopic', () => {
  it('полный пул: ровно по блюпринту, без shortfall, порядок частей single→multi→matching', () => {
    const pool = makePool({
      t1: { single: 10, multi: 4, matching: 2 },
      t2: { single: 10, multi: 4, matching: 2 },
      t3: { single: 10, multi: 4, matching: 2 },
      t4: { single: 10, multi: 4, matching: 2 },
    });
    const { picked, shortfall } = pickBalancedByTopic(pool);
    expect(picked).toHaveLength(40);
    expect(shortfall).toEqual([]);
    expect(picked.slice(0, 25).every((q) => q.type === 'single')).toBe(true);
    expect(picked.slice(25, 35).every((q) => q.type === 'multi')).toBe(true);
    expect(picked.slice(35, 40).every((q) => q.type === 'matching')).toBe(true);
    // без дублей
    expect(new Set(picked.map((q) => q.id)).size).toBe(40);
  });

  it('баланс по темам: 4 темы × 10 single, выбор 25 → 6–7 с каждой темы', () => {
    const pool = makePool({
      t1: { single: 10 },
      t2: { single: 10 },
      t3: { single: 10 },
      t4: { single: 10 },
    });
    const { picked } = pickBalancedByTopic(pool, [
      { type: 'single', count: 25, points: 1 },
    ]);
    expect(picked).toHaveLength(25);
    const perTopic = new Map<string, number>();
    for (const q of picked) perTopic.set(q.topic_id, (perTopic.get(q.topic_id) ?? 0) + 1);
    for (const n of perTopic.values()) {
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('нехватка: берём сколько есть + shortfall по типам', () => {
    const pool = makePool({ t1: { single: 3, matching: 1 } });
    const { picked, shortfall } = pickBalancedByTopic(pool);
    expect(picked).toHaveLength(4);
    expect(shortfall).toEqual([
      { type: 'single', available: 3, required: 25 },
      { type: 'multi', available: 0, required: 10 },
      { type: 'matching', available: 1, required: 5 },
    ]);
  });

  it('пустой пул: пусто + полный shortfall', () => {
    const { picked, shortfall } = pickBalancedByTopic([]);
    expect(picked).toEqual([]);
    expect(shortfall).toHaveLength(EXAM_BLUEPRINT.length);
  });

  it('одна тема: работает как обычный отбор', () => {
    const pool = makePool({ t1: { single: 30 } });
    const { picked } = pickBalancedByTopic(pool, [
      { type: 'single', count: 25, points: 1 },
    ]);
    expect(picked).toHaveLength(25);
  });
});

describe('scoreAnswer: single', () => {
  it('правильный ответ — 1', () => {
    expect(scoreAnswer('single', singleBody, 'b')).toBe(1);
  });
  it('неправильный — 0', () => {
    expect(scoreAnswer('single', singleBody, 'a')).toBe(0);
  });
  it('пропуск (null/undefined) — 0', () => {
    expect(scoreAnswer('single', singleBody, null)).toBe(0);
    expect(scoreAnswer('single', singleBody, undefined)).toBe(0);
  });
  it('мусорный тип ответа — 0', () => {
    expect(scoreAnswer('single', singleBody, ['b'])).toBe(0);
    expect(scoreAnswer('single', singleBody, 42)).toBe(0);
  });
});

describe('scoreAnswer: multi (частичный балл)', () => {
  it('все верные, без лишних — 2', () => {
    expect(scoreAnswer('multi', multiBody, ['b', 'c', 'e'])).toBe(2);
    expect(scoreAnswer('multi', multiBody, ['e', 'b', 'c'])).toBe(2);
  });
  it('одна ошибка (один пропущен) — 1', () => {
    expect(scoreAnswer('multi', multiBody, ['b', 'c'])).toBe(1);
  });
  it('одна ошибка (один лишний) — 1', () => {
    expect(scoreAnswer('multi', multiBody, ['b', 'c', 'e', 'a'])).toBe(1);
  });
  it('две ошибки (пропущен + лишний) — 0', () => {
    expect(scoreAnswer('multi', multiBody, ['b', 'c', 'a'])).toBe(0);
  });
  it('две ошибки (два пропущенных) — 0', () => {
    expect(scoreAnswer('multi', multiBody, ['b'])).toBe(0);
  });
  it('пустой выбор — 0 (отсутствие ответа, не «одна ошибка»)', () => {
    expect(scoreAnswer('multi', multiBody, [])).toBe(0);
  });
  it('пропуск/мусор — 0', () => {
    expect(scoreAnswer('multi', multiBody, null)).toBe(0);
    expect(scoreAnswer('multi', multiBody, 'b')).toBe(0);
  });
  it('дубликаты в ответе не дают лишних ошибок', () => {
    expect(scoreAnswer('multi', multiBody, ['b', 'b', 'c', 'e'])).toBe(2);
  });
});

describe('scoreAnswer: matching (частичный балл)', () => {
  it('все пары верные — 2', () => {
    expect(scoreAnswer('matching', matchingBody, { a: '1', b: '0', c: '2' })).toBe(2);
  });
  it('одна неверная пара — 1', () => {
    expect(scoreAnswer('matching', matchingBody, { a: '1', b: '0', c: '0' })).toBe(1);
  });
  it('одна пара не заполнена — 1 (одна ошибка)', () => {
    expect(scoreAnswer('matching', matchingBody, { a: '1', b: '0' })).toBe(1);
  });
  it('две и более ошибок — 0', () => {
    expect(scoreAnswer('matching', matchingBody, { a: '0', b: '1', c: '2' })).toBe(0);
  });
  it('пропуск — 0', () => {
    expect(scoreAnswer('matching', matchingBody, null)).toBe(0);
  });
  it('пустой объект — 0 (отсутствие ответа), даже при одной паре', () => {
    const onePair: QuestionBody = {
      stem: 's',
      left: [{ id: 'a', content: 'x' }],
      right: ['1', '2'],
      correct: { a: '1' },
    } as QuestionBody;
    expect(scoreAnswer('matching', onePair, {})).toBe(0);
    expect(scoreAnswer('matching', matchingBody, {})).toBe(0);
  });
  it('объект из пустых значений (сброшенные селекты) — 0', () => {
    const onePair: QuestionBody = {
      stem: 's',
      left: [{ id: 'a', content: 'x' }],
      right: ['1', '2'],
      correct: { a: '1' },
    } as QuestionBody;
    expect(scoreAnswer('matching', onePair, { a: '' })).toBe(0);
  });
  it('мусорный тип — 0', () => {
    expect(scoreAnswer('matching', matchingBody, ['1', '0', '2'])).toBe(0);
  });
});
