import { describe, it, expect } from 'vitest';
import { scoreAnswer, EXAM_MAX_SCORE, QUESTION_POINTS } from './exam';
import type { QuestionBody } from '@/types/db';

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
