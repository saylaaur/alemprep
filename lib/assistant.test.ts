import { describe, it, expect } from 'vitest';
import {
  AI_DAILY_LIMIT,
  buildAssistantContext,
  ASSISTANT_SYSTEM_PROMPT,
  splitAssistantAnswer,
  ASSISTANT_MODES,
  ASSISTANT_MAX_TURNS_PER_QUESTION,
  ASSISTANT_MAX_QUESTION_LENGTH,
  studentTurnLabel,
  type AssistantTurn,
} from './assistant';
import type { SingleBody, MultiBody, MatchingBody } from '@/types/db';

const singleQuestion = {
  type: 'single' as const,
  body: {
    stem: 'Найдите $\\log_2 8$',
    options: [
      { id: 'A', content: '2' },
      { id: 'B', content: '3' },
      { id: 'C', content: '4' },
    ],
    correct: 'B',
  } satisfies SingleBody,
  explanation: {
    blocks: [{ type: 'text' as const, value: '$2^3 = 8$, значит ответ 3.' }],
  },
};

describe('AI_DAILY_LIMIT', () => {
  it('равен 5 — базовая дневная норма из v1', () => {
    expect(AI_DAILY_LIMIT).toBe(5);
  });
});

describe('buildAssistantContext', () => {
  it('включает условие задачи (stem)', () => {
    const ctx = buildAssistantContext(singleQuestion, null, 'hint');
    expect(ctx).toContain('Найдите $\\log_2 8$');
  });

  it('в режиме hint явно запрещает называть правильный ответ', () => {
    const ctx = buildAssistantContext(singleQuestion, null, 'hint');
    expect(ctx.toLowerCase()).toContain('не называй');
  });

  it('в режиме hint без ответа ученика сообщает, что ответа пока нет', () => {
    const ctx = buildAssistantContext(singleQuestion, null, 'hint');
    expect(ctx).toContain('пока не отвечал');
  });

  it('в режиме why-wrong включает ответ ученика', () => {
    const ctx = buildAssistantContext(singleQuestion, 'A', 'why-wrong', { answerRevealed: true });
    expect(ctx).toContain('Ответ ученика: A');
  });

  it('в режиме why-wrong НЕ содержит запрет называть ответ (уже проверено)', () => {
    const ctx = buildAssistantContext(singleQuestion, 'A', 'why-wrong', { answerRevealed: true });
    expect(ctx.toLowerCase()).not.toContain('не называй');
  });

  it('в режиме simpler включает готовый разбор задачи', () => {
    const ctx = buildAssistantContext(singleQuestion, 'B', 'simpler', { answerRevealed: true });
    expect(ctx).toContain('2^3 = 8');
  });

  it('форматирует multi-вопрос с несколькими правильными ответами', () => {
    const multiQuestion = {
      type: 'multi' as const,
      body: {
        stem: 'Выберите чётные числа',
        options: [
          { id: 'A', content: '2' },
          { id: 'B', content: '3' },
          { id: 'C', content: '4' },
        ],
        correct: ['A', 'C'],
      } satisfies MultiBody,
      explanation: null,
    };
    const ctx = buildAssistantContext(multiQuestion, ['A', 'B'], 'why-wrong', { answerRevealed: true });
    expect(ctx).toContain('Ответ ученика: A, B');
  });

  it('форматирует matching-вопрос с парами ответов', () => {
    const matchingQuestion = {
      type: 'matching' as const,
      body: {
        stem: 'Сопоставьте функции и производные',
        left: [{ id: 'A', content: '$x^2$' }],
        right: ['$2x$', '$1$'],
        correct: { A: '$2x$' },
      } satisfies MatchingBody,
      explanation: null,
    };
    const ctx = buildAssistantContext(matchingQuestion, { A: '$1$' }, 'why-wrong', { answerRevealed: true });
    expect(ctx).toContain('A → $1$');
  });

  it('на постороннюю тему системный промпт задаёт границу школьной программы ЕНТ', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('ЕНТ');
  });

  it('системный промпт запрещает markdown-разметку (#, **, списки)', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('#');
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('**');
    expect(ASSISTANT_SYSTEM_PROMPT.toLowerCase()).toContain('markdown');
  });

  it('hint без answerRevealed: в контексте нет ни правильного ответа, ни разбора', () => {
    const ctx = buildAssistantContext(singleQuestion, null, 'hint');
    expect(ctx).not.toContain('Правильный ответ: B');
    expect(ctx).not.toContain('2^3 = 8');
  });

  it('ask без answerRevealed: в контексте нет ни правильного ответа, ни разбора', () => {
    const ctx = buildAssistantContext(singleQuestion, null, 'ask', { answerRevealed: false, userQuestion: 'А почему не A?' });
    expect(ctx).not.toContain('Правильный ответ: B');
    expect(ctx).not.toContain('2^3 = 8');
  });

  it('ask до раскрытия: запрещает называть ответ и включает буквальный текст вопроса ученика', () => {
    const ctx = buildAssistantContext(singleQuestion, null, 'ask', { answerRevealed: false, userQuestion: 'А почему не A?' });
    expect(ctx.toLowerCase()).toContain('не называй');
    expect(ctx).toContain('А почему не A?');
  });

  it('ask после раскрытия: не запрещает называть ответ и включает правильный ответ', () => {
    const ctx = buildAssistantContext(singleQuestion, 'A', 'ask', { answerRevealed: true, userQuestion: 'А почему не A?' });
    expect(ctx.toLowerCase()).not.toContain('не называй');
    expect(ctx).toContain('Правильный ответ: B');
  });
});

describe('ASSISTANT_MODES / лимиты', () => {
  it('ASSISTANT_MODES перечисляет все четыре режима', () => {
    expect(ASSISTANT_MODES).toEqual(['hint', 'why-wrong', 'simpler', 'ask']);
  });

  it('ASSISTANT_MAX_TURNS_PER_QUESTION равен 4', () => {
    expect(ASSISTANT_MAX_TURNS_PER_QUESTION).toBe(4);
  });

  it('ASSISTANT_MAX_QUESTION_LENGTH равен 300', () => {
    expect(ASSISTANT_MAX_QUESTION_LENGTH).toBe(300);
  });
});

describe('studentTurnLabel', () => {
  it('для реплики-пресета возвращает русскую метку режима', () => {
    const turn: AssistantTurn = { role: 'student', mode: 'hint', text: 'hint' };
    expect(studentTurnLabel(turn)).toBe('Подсказка');
  });

  it('для реплики со свободным вопросом (mode=null) возвращает текст как есть', () => {
    const turn: AssistantTurn = { role: 'student', mode: null, text: 'А почему не A?' };
    expect(studentTurnLabel(turn)).toBe('А почему не A?');
  });
});

describe('splitAssistantAnswer', () => {
  it('разбивает несколько абзацев по пустой строке на N элементов', () => {
    const text = 'Первый абзац.\n\nВторой абзац.\n\nТретий абзац.';
    expect(splitAssistantAnswer(text)).toEqual(['Первый абзац.', 'Второй абзац.', 'Третий абзац.']);
  });

  it('один абзац без пустых строк → один элемент', () => {
    expect(splitAssistantAnswer('Единственный абзац без разрывов.')).toEqual([
      'Единственный абзац без разрывов.',
    ]);
  });

  it('схлопывает лишние пустые строки между абзацами', () => {
    const text = 'Первый.\n\n\n\nВторой.';
    expect(splitAssistantAnswer(text)).toEqual(['Первый.', 'Второй.']);
  });

  it('обрезает пробелы вокруг абзацев и отбрасывает пустые', () => {
    const text = '  Первый.  \n\n   \n\nВторой.  ';
    expect(splitAssistantAnswer(text)).toEqual(['Первый.', 'Второй.']);
  });
});
