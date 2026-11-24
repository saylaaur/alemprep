import { describe, expect, it } from 'vitest';
import { parseCardDeck } from './content';
import { cardsOf } from './registry';
import { answer, currentCard, flip, isFinished, retryMissed, startSession, summary } from './session';

const deck = [
  { id: 'a', front: 'Q1', back: 'A1' },
  { id: 'b', front: 'Q2', back: 'A2' },
  { id: 'c', front: 'Q3', back: 'A3' },
];

describe('parseCardDeck', () => {
  it('принимает нормальную колоду', () => {
    expect(parseCardDeck(deck)).toHaveLength(3);
  });
  it('отбрасывает повторяющиеся id, пустой текст и лишние поля', () => {
    expect(parseCardDeck([deck[0], deck[0]])).toBeNull();
    expect(parseCardDeck([{ id: 'x', front: ' ', back: 'A' }])).toBeNull();
    expect(parseCardDeck([{ id: 'x', front: 'Q', back: 'A', extra: 1 }])).toBeNull();
    expect(parseCardDeck([])).toBeNull();
    expect(parseCardDeck(null)).toBeNull();
  });
});

describe('cardsOf', () => {
  it('отдаёт 15 карточек по законам Ньютона', () => {
    const d = cardsOf('newton-laws', 'ru');
    expect(d?.cards).toHaveLength(15);
    expect(d?.fallback).toBe(false);
  });
  it('для казахского отдаёт казахские карточки с теми же id и иллюстрациями', () => {
    const ru = cardsOf('newton-laws', 'ru');
    const kk = cardsOf('newton-laws', 'kk');
    expect(kk?.fallback).toBe(false);
    expect(kk?.cards.map((c) => c.id)).toEqual(ru?.cards.map((c) => c.id));
    expect(kk?.cards.map((c) => c.art)).toEqual(ru?.cards.map((c) => c.art));
    expect(kk?.cards[0].front).not.toBe(ru?.cards[0].front);
  });
  it('неизвестная книга и чужой slug — null', () => {
    expect(cardsOf('nope', 'ru')).toBeNull();
    expect(cardsOf('__proto__', 'ru')).toBeNull();
  });
});

describe('session', () => {
  it('ответить до открытия карточки нельзя', () => {
    const s = startSession(deck);
    expect(answer(s, true)).toBe(s);
  });

  it('проходит колоду и считает долю вспомненного', () => {
    let s = startSession(deck);
    expect(currentCard(s)?.id).toBe('a');
    s = answer(flip(s), true);
    s = answer(flip(s), false);
    expect(isFinished(s)).toBe(false);
    s = answer(flip(s), true);
    expect(isFinished(s)).toBe(true);
    const r = summary(s);
    expect(r.recalled).toBe(2);
    expect(r.total).toBe(3);
    expect(r.ratio).toBeCloseTo(2 / 3);
    expect(r.missed.map((c) => c.id)).toEqual(['b']);
  });

  it('повтор забытых — новый проход, а если забытых нет — null', () => {
    let s = startSession(deck);
    s = answer(flip(s), false);
    s = answer(flip(s), true);
    s = answer(flip(s), false);
    const retry = retryMissed(s);
    expect(retry?.deck.map((c) => c.id)).toEqual(['a', 'c']);
    expect(retry?.pass).toBe(1);

    let ok = startSession(deck);
    for (let i = 0; i < 3; i++) ok = answer(flip(ok), true);
    expect(retryMissed(ok)).toBeNull();
    expect(summary(ok).ratio).toBe(1);
  });

  it('после конца колоды ничего не меняется', () => {
    let s = startSession([deck[0]]);
    s = answer(flip(s), true);
    expect(flip(s)).toBe(s);
    expect(answer(s, false)).toBe(s);
  });
});
