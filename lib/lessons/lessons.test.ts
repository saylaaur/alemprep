import { describe, expect, it } from 'vitest';
import { LESSONS, getLesson, resolveLesson } from './catalog';
import { answeredCount, correctCount, fill, isTopicClosed, lessonPercent, parseProgress } from './progress';
import { shuffleOptions } from './shuffle';
import { bookContentOf } from '@/lib/local/book-content';
import { parseBookContent } from '@/lib/books/content';
import { cardsOf } from '@/lib/cards/registry';

describe('lesson catalog', () => {
  it('every lesson passes the schema (12–15 problems, mock ≥ 8)', () => {
    expect(LESSONS.length).toBeGreaterThan(0);
    for (const l of LESSONS) {
      expect(l.ru.problems.length).toBeGreaterThanOrEqual(12);
      expect(l.ru.problems.length).toBeLessThanOrEqual(15);
    }
  });

  it('has unique question ids and no Cyrillic outside \\text{} inside formulas', () => {
    for (const l of LESSONS) {
      const all = [...l.ru.problems, ...l.ru.mock];
      expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
      for (const q of all) {
        const text = [q.question, q.solution, ...q.options].join('\n');
        for (const m of text.matchAll(/\$([^$]+)\$/g)) {
          const withoutText = m[1].replace(/\\text\{[^}]*\}/g, '');
          expect(withoutText, `${q.id}: кириллица в формуле`).not.toMatch(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/);
        }
      }
    }
  });

  it('the mock test never repeats a practice problem', () => {
    for (const l of LESSONS) {
      const practice = new Set(l.ru.problems.map((q) => q.question));
      for (const q of l.ru.mock) expect(practice.has(q.question)).toBe(false);
    }
  });

  it('falls back to Russian text for Kazakh while problems are not translated', () => {
    const l = getLesson('newton-laws')!;
    const kk = resolveLesson(l, 'kk');
    expect(kk.title).toBe('Ньютон заңдары');
    expect(kk.textFallback).toBe(true);
    expect(kk.problems).toHaveLength(l.ru.problems.length);
    expect(resolveLesson(l, 'ru').textFallback).toBe(false);
  });
});

describe('every lesson ships with its book and cards', () => {
  it('has a valid ru+kk book, a card deck in both languages and a poster path', () => {
    for (const l of LESSONS) {
      const raw = bookContentOf(l.bookSlug);
      expect(raw, `${l.id}: нет книги`).toBeDefined();
      expect(parseBookContent(raw!.ru), `${l.id}: книга ru`).not.toBeNull();
      expect(parseBookContent(raw!.kk), `${l.id}: книга kk`).not.toBeNull();
      expect(cardsOf(l.bookSlug, 'ru')?.cards.length, `${l.id}: карточки`).toBeGreaterThanOrEqual(12);
      expect(cardsOf(l.bookSlug, 'kk')?.fallback, `${l.id}: карточки kk`).toBe(false);
    }
  });

  it('the right answer is never repeated among the distractors', () => {
    for (const l of LESSONS) {
      for (const q of [...l.ru.problems, ...l.ru.mock]) {
        expect(new Set(q.options).size, q.id).toBe(q.options.length);
      }
    }
  });
});

describe('shuffleOptions', () => {
  it('is deterministic and keeps the right answer', () => {
    const opts = ['верно', 'a', 'b', 'c', 'd'];
    const a = shuffleOptions('q-1', opts, 0);
    const b = shuffleOptions('q-1', opts, 0);
    expect(a).toEqual(b);
    expect([...a.options].sort()).toEqual([...opts].sort());
    expect(a.options[a.correct]).toBe('верно');
  });

  it('does not always leave the right answer first', () => {
    const l = getLesson('newton-laws')!;
    const positions = new Set(resolveLesson(l, 'ru').problems.map((q) => q.correct));
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe('progress', () => {
  const problems = [
    { id: 'a', correct: 1 },
    { id: 'b', correct: 0 },
    { id: 'c', correct: 2 },
  ];

  it('closes the topic only when every problem is answered', () => {
    const p = parseProgress(JSON.stringify({ answers: { a: 1, b: 3 } }));
    expect(answeredCount(problems, p)).toBe(2);
    expect(correctCount(problems, p)).toBe(1);
    expect(isTopicClosed(problems, p)).toBe(false);
    p.answers.c = 0;
    expect(isTopicClosed(problems, p)).toBe(true);
  });

  it('survives broken storage', () => {
    expect(parseProgress('{oops').answers).toEqual({});
    expect(parseProgress(null).watched).toBe(false);
    expect(parseProgress(JSON.stringify({ answers: { a: -1, b: 'x' }, mock: { score: 1, total: 0 } }))).toEqual({
      answers: {},
      watched: false,
      mock: null,
    });
  });

  it('counts percent from problems, video and mock', () => {
    const p = parseProgress(JSON.stringify({ answers: { a: 1, b: 0, c: 2 }, watched: true, mock: { score: 8, total: 10 } }));
    expect(lessonPercent(problems, p)).toBe(100);
    expect(lessonPercent(problems, parseProgress(null))).toBe(0);
  });

  it('fills templates', () => {
    expect(fill('Решено {done} из {total}', { done: 3, total: 12 })).toBe('Решено 3 из 12');
    expect(fill('{x}', {})).toBe('{x}');
  });
});
