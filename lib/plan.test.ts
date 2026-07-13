import { describe, it, expect } from 'vitest';
import { daysUntilExam, projectedPairScore, buildPriorityTopics } from './plan';

describe('daysUntilExam', () => {
  it('положительное число дней для будущей даты', () => {
    expect(daysUntilExam('2026-08-01', '2026-07-14')).toBe(18);
  });
  it('0 для сегодняшней даты', () => {
    expect(daysUntilExam('2026-07-14', '2026-07-14')).toBe(0);
  });
  it('отрицательное число для прошедшей даты', () => {
    expect(daysUntilExam('2026-07-01', '2026-07-14')).toBe(-13);
  });
});

describe('projectedPairScore', () => {
  it('0 баллов диагностики → 0 прогноз', () => {
    expect(projectedPairScore(0)).toBe(0);
  });
  it('максимум диагностики (24) → максимум пары (110)', () => {
    expect(projectedPairScore(24)).toBe(110);
  });
  it('половина диагностики → примерно половина пары', () => {
    expect(projectedPairScore(12)).toBe(55);
  });
  it('клэмпит отрицательные и превышающие значения', () => {
    expect(projectedPairScore(-5)).toBe(0);
    expect(projectedPairScore(100)).toBe(110);
  });
});

describe('buildPriorityTopics', () => {
  const stats = [
    { topicId: 't1', nameRu: 'Логарифмы', nameKk: 'Логарифмдер', total: 3, correct: 1 },
    { topicId: 't2', nameRu: 'Стереометрия', nameKk: 'Стереометрия', total: 2, correct: 2 },
    { topicId: 't3', nameRu: 'Пусто', nameKk: 'Пусто', total: 0, correct: 0 },
    { topicId: 't4', nameRu: 'Тригонометрия', nameKk: 'Тригонометрия', total: 4, correct: 1 },
  ];

  it('сортирует по возрастанию точности, темы без попыток исключены', () => {
    const res = buildPriorityTopics(stats);
    expect(res.map((t) => t.topicId)).toEqual(['t4', 't1', 't2']);
  });

  it('ограничивает лимитом', () => {
    const res = buildPriorityTopics(stats, 2);
    expect(res).toHaveLength(2);
  });
});
