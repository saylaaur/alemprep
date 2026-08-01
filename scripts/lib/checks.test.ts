import { describe, it, expect } from 'vitest';
import { validateTranslation, extractLatexSegments, type TranslationOriginal } from './checks';

const singleOriginal: TranslationOriginal = {
  type: 'single',
  body: {
    stem: 'Найдите $\\log_2 8$.',
    options: [
      { id: 'a', content: '$2$' },
      { id: 'b', content: '$3$' },
      { id: 'c', content: '$4$' },
    ],
    correct: 'b',
  },
  explanation: {
    blocks: [
      { type: 'text', value: 'Так как $2^3 = 8$, ответ — 3.' },
      { type: 'latex', value: '\\log_2 8 = 3' },
    ],
  },
};

function validSingleTranslation() {
  return {
    body: {
      stem: 'Табыңыз $\\log_2 8$.',
      options: [
        { id: 'a', content: '$2$' },
        { id: 'b', content: '$3$' },
        { id: 'c', content: '$4$' },
      ],
      correct: 'b',
    },
    explanation: {
      blocks: [
        { type: 'text', value: 'Себебі $2^3 = 8$, жауабы — 3.' },
        { type: 'latex', value: '\\log_2 8 = 3' },
      ],
    },
  };
}

const matchingOriginal: TranslationOriginal = {
  type: 'matching',
  body: {
    stem: 'Сопоставьте значения',
    left: [
      { id: 'a', content: '$\\ln e$' },
      { id: 'b', content: '$\\ln 1$' },
    ],
    right: ['ноль', 'один'],
    correct: { a: 'один', b: 'ноль' },
  },
  explanation: { blocks: [{ type: 'text', value: 'Стандартные значения логарифма.' }] },
};

function validMatchingTranslation() {
  return {
    body: {
      stem: 'Мәндерді сәйкестендіріңіз',
      left: [
        { id: 'a', content: '$\\ln e$' },
        { id: 'b', content: '$\\ln 1$' },
      ],
      right: ['нөл', 'бір'],
      correct: { a: 'бір', b: 'нөл' },
    },
    explanation: { blocks: [{ type: 'text', value: 'Логарифмнің стандартты мәндері.' }] },
  };
}

describe('extractLatexSegments', () => {
  it('extracts $...$ segments in order', () => {
    expect(extractLatexSegments('$x^2$ плюс $y$')).toEqual(['$x^2$', '$y$']);
  });
  it('empty array when no LaTeX', () => {
    expect(extractLatexSegments('просто текст')).toEqual([]);
  });
});

describe('validateTranslation: валидные переводы', () => {
  it('single: проходит', () => {
    const res = validateTranslation(singleOriginal, validSingleTranslation());
    expect(res.ok).toBe(true);
  });

  it('matching: correct ремаппится на переведённые значения right — проходит', () => {
    const res = validateTranslation(matchingOriginal, validMatchingTranslation());
    expect(res.ok).toBe(true);
  });
});

describe('validateTranslation: защита от битых данных', () => {
  it('не JSON-объект ожидаемой формы — отбраковка', () => {
    const res = validateTranslation(singleOriginal, { oops: true });
    expect(res.ok).toBe(false);
  });

  it('число вариантов не совпадает — отбраковка', () => {
    const bad = validSingleTranslation();
    bad.body.options = bad.body.options.slice(0, 2);
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/option count/);
  });

  it('id варианта изменён — отбраковка', () => {
    const bad = validSingleTranslation();
    bad.body.options[0].id = 'z';
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/option id set changed/);
  });

  it('correct изменён (single) — отбраковка', () => {
    const bad = validSingleTranslation();
    bad.body.correct = 'a';
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/correct changed/);
  });

  it('LaTeX изменён в stem — отбраковка (самая важная проверка)', () => {
    const bad = validSingleTranslation();
    bad.body.stem = 'Табыңыз $\\log_3 9$.';
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/LaTeX altered in stem/);
  });

  it('LaTeX изменён в варианте ответа — отбраковка', () => {
    const bad = validSingleTranslation();
    bad.body.options[1].content = '$5$';
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/LaTeX altered in option/);
  });

  it('LaTeX-блок разбора изменён — отбраковка (должен копироваться посимвольно)', () => {
    const bad = validSingleTranslation();
    bad.explanation.blocks[1].value = '\\log_2 8 = 4';
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/LaTeX explanation block/);
  });

  it('тип блока разбора изменён — отбраковка', () => {
    const bad = validSingleTranslation();
    bad.explanation.blocks[1].type = 'text';
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/type changed/);
  });

  it('количество блоков разбора не совпадает — отбраковка', () => {
    const bad = validSingleTranslation();
    bad.explanation.blocks = bad.explanation.blocks.slice(0, 1);
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/explanation block count/);
  });

  it('matching: id left изменён — отбраковка', () => {
    const bad = validMatchingTranslation();
    bad.body.left[0].id = 'z';
    const res = validateTranslation(matchingOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/left id set changed/);
  });

  it('matching: ключи correct изменены — отбраковка', () => {
    const bad = validMatchingTranslation();
    (bad.body as { correct: Record<string, string> }).correct = { z: 'бір', b: 'нөл' };
    const res = validateTranslation(matchingOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/correct keys changed/);
  });

  it('matching: значение correct не входит в переведённый right — отбраковка', () => {
    const bad = validMatchingTranslation();
    bad.body.correct = { a: 'бір', b: 'басқа мән' };
    const res = validateTranslation(matchingOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not found in translated right list/);
  });

  it('текст вернулся как есть (не переведён) — отбраковка', () => {
    const same = {
      body: singleOriginal.body,
      explanation: singleOriginal.explanation,
    };
    const res = validateTranslation(singleOriginal, same);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/identical to original|no Kazakh/);
  });

  it('нет казахских символов (например, вернули английский) — отбраковка', () => {
    const bad = validSingleTranslation();
    bad.body.stem = 'Find $\\log_2 8$.';
    bad.explanation.blocks[0].value = 'Since $2^3 = 8$, the answer is 3.';
    const res = validateTranslation(singleOriginal, bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/no Kazakh/);
  });
});
