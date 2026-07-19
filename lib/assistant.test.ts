import { describe, it, expect } from 'vitest';
import { AI_DAILY_LIMIT, buildAssistantContext, ASSISTANT_SYSTEM_PROMPT } from './assistant';
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
    const ctx = buildAssistantContext(singleQuestion, 'A', 'why-wrong');
    expect(ctx).toContain('Ответ ученика: A');
  });

  it('в режиме why-wrong НЕ содержит запрет называть ответ (уже проверено)', () => {
    const ctx = buildAssistantContext(singleQuestion, 'A', 'why-wrong');
    expect(ctx.toLowerCase()).not.toContain('не называй');
  });

  it('в режиме simpler включает готовый разбор задачи', () => {
    const ctx = buildAssistantContext(singleQuestion, 'B', 'simpler');
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
    const ctx = buildAssistantContext(multiQuestion, ['A', 'B'], 'why-wrong');
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
    const ctx = buildAssistantContext(matchingQuestion, { A: '$1$' }, 'why-wrong');
    expect(ctx).toContain('A → $1$');
  });

  it('на постороннюю тему системный промпт задаёт границу школьной программы ЕНТ', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('ЕНТ');
  });
});
