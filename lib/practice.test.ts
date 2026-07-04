import { describe, it, expect } from 'vitest';
import { checkAnswer, isAnswerComplete, isAnswerEmpty } from './practice';
import type { QuestionBody } from '@/types/db';

const singleBody: QuestionBody = {
  stem: '2+2?',
  options: [
    { id: 'a', content: '3' },
    { id: 'b', content: '4' },
  ],
  correct: 'b',
} as QuestionBody;

const multiBody: QuestionBody = {
  stem: 'чётные?',
  options: [
    { id: 'a', content: '1' },
    { id: 'b', content: '2' },
    { id: 'c', content: '4' },
  ],
  correct: ['b', 'c'],
} as QuestionBody;

const matchingBody: QuestionBody = {
  stem: 'сопоставь',
  left: [
    { id: 'a', content: 'ln e' },
    { id: 'b', content: 'ln 1' },
  ],
  right: ['0', '1'],
  correct: { a: '1', b: '0' },
} as QuestionBody;

describe('checkAnswer (тренажёр, без частичного зачёта)', () => {
  it('single: строгое совпадение', () => {
    expect(checkAnswer('single', 'b', singleBody)).toBe(true);
    expect(checkAnswer('single', 'a', singleBody)).toBe(false);
    expect(checkAnswer('single', null, singleBody)).toBe(false);
  });

  it('multi: точное множество, порядок не важен', () => {
    expect(checkAnswer('multi', ['b', 'c'], multiBody)).toBe(true);
    expect(checkAnswer('multi', ['c', 'b'], multiBody)).toBe(true);
  });
  it('multi: лишний или пропущенный — неверно', () => {
    expect(checkAnswer('multi', ['b'], multiBody)).toBe(false);
    expect(checkAnswer('multi', ['a', 'b', 'c'], multiBody)).toBe(false);
    expect(checkAnswer('multi', [], multiBody)).toBe(false);
  });
  it('multi: не-массив — неверно, не крэш', () => {
    expect(checkAnswer('multi', 'b', multiBody)).toBe(false);
  });

  it('matching: все пары совпадают', () => {
    expect(checkAnswer('matching', { a: '1', b: '0' }, matchingBody)).toBe(true);
  });
  it('matching: одна пара не так или не заполнена — неверно', () => {
    expect(checkAnswer('matching', { a: '0', b: '1' }, matchingBody)).toBe(false);
    expect(checkAnswer('matching', { a: '1' }, matchingBody)).toBe(false);
    expect(checkAnswer('matching', {}, matchingBody)).toBe(false);
  });
  it('matching: массив вместо объекта — неверно, не крэш', () => {
    expect(checkAnswer('matching', ['1', '0'], matchingBody)).toBe(false);
  });
});

describe('isAnswerComplete (когда активна кнопка «Проверить»)', () => {
  it('single: непустая строка', () => {
    expect(isAnswerComplete('single', 'a', singleBody)).toBe(true);
    expect(isAnswerComplete('single', '', singleBody)).toBe(false);
    expect(isAnswerComplete('single', null, singleBody)).toBe(false);
  });
  it('multi: хотя бы один выбранный', () => {
    expect(isAnswerComplete('multi', ['a'], multiBody)).toBe(true);
    expect(isAnswerComplete('multi', [], multiBody)).toBe(false);
  });
  it('matching: заполнены все пары', () => {
    expect(isAnswerComplete('matching', { a: '1', b: '0' }, matchingBody)).toBe(true);
    expect(isAnswerComplete('matching', { a: '1' }, matchingBody)).toBe(false);
    expect(isAnswerComplete('matching', { a: '1', b: '' }, matchingBody)).toBe(false);
    expect(isAnswerComplete('matching', {}, matchingBody)).toBe(false);
  });
  it('matching: массив вместо объекта — не готово, не крэш', () => {
    expect(isAnswerComplete('matching', ['1', '0'], matchingBody)).toBe(false);
  });
});

describe('isAnswerEmpty (пробник: «отвечено» vs «пропущено»)', () => {
  it('null/undefined — пусто', () => {
    expect(isAnswerEmpty(null)).toBe(true);
    expect(isAnswerEmpty(undefined)).toBe(true);
  });
  it('строки', () => {
    expect(isAnswerEmpty('')).toBe(true);
    expect(isAnswerEmpty('a')).toBe(false);
  });
  it('массивы (multi: снял все галочки — пусто)', () => {
    expect(isAnswerEmpty([])).toBe(true);
    expect(isAnswerEmpty(['a'])).toBe(false);
  });
  it('объекты (matching: все селекты сброшены — пусто)', () => {
    expect(isAnswerEmpty({})).toBe(true);
    expect(isAnswerEmpty({ a: '' })).toBe(true);
    expect(isAnswerEmpty({ a: '', b: '1' })).toBe(false);
  });
});
