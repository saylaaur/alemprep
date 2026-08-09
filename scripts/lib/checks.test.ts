import { describe, it, expect } from 'vitest';
import {
  validateTranslation,
  extractLatexSegments,
  referencesMissingVisual,
  validateAndFilter,
  type TranslationOriginal,
} from './checks';
import type { GeneratedQuestion, SingleBody, MatchingBody } from './schema';

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

// =====================================================
// referencesMissingVisual (scripts/transcribe-questions.ts --multi,
// scripts/generate-variants.ts via validateAndFilter)
// =====================================================

function singleQuestionBody(
  stem: string,
  optionContents: string[] = ['1', '2'],
  explanationText = 'Пояснение без ссылок на картинку.',
): {
  body: SingleBody;
  explanation: { blocks: { type: 'text'; value: string }[] };
} {
  return {
    body: {
      stem,
      options: optionContents.map((content, i) => ({ id: String.fromCharCode(97 + i), content })),
      correct: 'a',
    },
    explanation: { blocks: [{ type: 'text', value: explanationText }] },
  };
}

function matchingQuestionBody(
  stem: string,
  left: string[],
  right: string[],
): { body: MatchingBody; explanation: { blocks: { type: 'text'; value: string }[] } } {
  return {
    body: {
      stem,
      left: left.map((content, i) => ({ id: String(i + 1), content })),
      right,
      correct: { '1': right[0] },
    },
    explanation: { blocks: [{ type: 'text', value: 'Пояснение без ссылок на картинку.' }] },
  };
}

describe('referencesMissingVisual: реальные примеры из физики — срабатывает', () => {
  it('электроёмкость батареи, изображённой на рисунке', () => {
    expect(
      referencesMissingVisual(
        singleQuestionBody(
          'Если C1=C2=C3=C4=C5=9 мкФ, то определите электроёмкость батареи конденсаторов, изображённой на рисунке.',
        ),
      ),
    ).toBe(true);
  });

  it('лампы соединены, как показано на рисунке', () => {
    expect(
      referencesMissingVisual(
        singleQuestionBody('Одинаковые лампы соединены, как показано на рисунке. При замыкании ключа:'),
      ),
    ).toBe(true);
  });

  it('на графике показано', () => {
    expect(
      referencesMissingVisual(
        singleQuestionBody(
          'Работа газа при переходе из состояния A в состояние B. На графике показано, что...',
        ),
      ),
    ).toBe(true);
  });

  it('сопротивления указаны на рисунке', () => {
    expect(
      referencesMissingVisual(
        singleQuestionBody('Ученик собрал электрическую цепь, как показано на рисунке. Сопротивления указаны на рисунке.'),
      ),
    ).toBe(true);
  });
});

describe('referencesMissingVisual: ловит ссылку в любом месте тела вопроса', () => {
  it('ссылка в тексте варианта ответа, а не в stem', () => {
    expect(referencesMissingVisual(singleQuestionBody('Найдите значение x.', ['5', 'см. рис. 2']))).toBe(
      true,
    );
  });

  it('ссылка в left/right matching-задания', () => {
    expect(
      referencesMissingVisual(
        matchingQuestionBody('Установите соответствие.', ['элемент 1', 'элемент 2'], [
          'значение, указанное на схеме',
          'другое значение',
        ]),
      ),
    ).toBe(true);
  });
});

describe('referencesMissingVisual: варианты формулировок', () => {
  const cases: [string, string][] = [
    ['на чертеже', 'Найдите угол ABC на чертеже.'],
    ['на диаграмме', 'Данные приведены на диаграмме.'],
    ['на схеме', 'Ток течёт, как указано на схеме.'],
    ['в таблице', 'Значения приведены в таблице.'],
    ['ё вместо е (изображён)', 'Тело, изображённое на рисунке, движется равномерно.'],
    ['регистр не важен', 'КАК ПОКАЗАНО НА РИСУНКЕ, цепь замкнута.'],
  ];
  for (const [label, stem] of cases) {
    it(label, () => {
      expect(referencesMissingVisual(singleQuestionBody(stem))).toBe(true);
    });
  }
});

describe('referencesMissingVisual: НЕ ловит самостоятельное построение графика/таблицы', () => {
  const cases: [string, string][] = [
    ['постройте график функции', 'Постройте график функции y = 2x + 1 и определите промежутки возрастания.'],
    ['найдите график производной', 'Найдите график производной функции f(x) = x^2 - 3x.'],
    ['обычная задача без визуальных ссылок', 'Решите уравнение $x^2 - 5x + 6 = 0$.'],
    ['существительное «изображение» — не причастие', 'Задача не требует изображения для решения.'],
  ];
  for (const [label, stem] of cases) {
    it(label, () => {
      expect(referencesMissingVisual(singleQuestionBody(stem))).toBe(false);
    });
  }
});

describe('referencesMissingVisual: ссылка утекла только в explanation (реальный кейс с фото физики)', () => {
  it('stem/options не решаемы без картинки, но пояснение выдаёт, что данные — с графика', () => {
    const q = singleQuestionBody(
      'Работа, совершённая одноатомным идеальным газом при переходе из состояния A в состояние B равна',
      ['2PV', '4PV', '6PV', '8PV'],
      'На графике P-V диаграмме показаны два состояния газа: состояние A при объёме V и давлении 2P, и состояние B при объёме 3V и давлении 2P.',
    );
    expect(referencesMissingVisual(q)).toBe(true);
  });

  it('пояснение без ссылок на картинку не срабатывает', () => {
    const q = singleQuestionBody('Решите уравнение $x^2 - 5x + 6 = 0$.', ['2', '3'], 'Раскладываем на множители и находим корни.');
    expect(referencesMissingVisual(q)).toBe(false);
  });

  it('модель признаётся, что решает без полной схемы (реальный кейс — фиктивный ответ)', () => {
    const q = singleQuestionBody(
      'Значение силы тока $I_1$',
      ['18 А', '14 А', '12 А', '8 А'],
      'Задача требует расчёта силы тока в цепи. Без полной схемы и условий задачи точное решение невозможно, однако ответ указан как 12 А.',
    );
    expect(referencesMissingVisual(q)).toBe(true);
  });
});

describe('validateAndFilter: отбраковывает вопросы со ссылкой на отсутствующую картинку', () => {
  function generatedQuestion(stem: string): GeneratedQuestion {
    return {
      topic_slug: 'electric-current',
      type: 'single',
      difficulty: 3,
      body: {
        stem,
        options: [
          { id: 'a', content: '1' },
          { id: 'b', content: '2' },
        ],
        correct: 'a',
      },
      explanation: { blocks: [{ type: 'text', value: 'Пояснение.' }] },
      variant_of: 'src.jpg',
    };
  }

  it('отбрасывает вариант, ссылающийся на рисунок', () => {
    const { valid, rejected } = validateAndFilter([
      generatedQuestion('Сопротивление указано на рисунке. Найдите ток.'),
      generatedQuestion('Обычная задача без картинок.'),
    ]);
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/visual/i);
  });
});
