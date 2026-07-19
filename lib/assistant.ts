/**
 * Чистая логика ИИ-ассистента (Слой 2, docs/ai-assistant-design.md): дневной
 * лимит, режимы и сборка скоуп-контекста задачи для модели. Без сети и БД —
 * тестируется напрямую. Вызов модели и лимит — в lib/supabase/assistant-actions.ts.
 */

import type { Explanation, MatchingBody, MultiBody, QuestionBody, QuestionType, SingleBody } from '@/types/db';

/** Базовая дневная норма запросов к ИИ-ассистенту — каждому поровну (v1, без бонусов). */
export const AI_DAILY_LIMIT = 5;

/** Выбор модели через env, с дефолтом — тот же подход, что в scripts/lib/models.ts. */
export function resolveModel(envVar: string, fallback: string): string {
  return process.env[envVar]?.trim() || fallback;
}

export type AssistantMode = 'hint' | 'why-wrong' | 'simpler';

/**
 * Системный промпт: жёсткая граница тем (школьная программа ЕНТ), отказ на
 * постороннее/вредное, возрастная уместность, запрет сбора личных данных.
 * Обязателен для продукта, где ИИ общается с несовершеннолетними.
 */
export const ASSISTANT_SYSTEM_PROMPT = `Ты — ИИ-репетитор AlemPrep, помогаешь школьнику Казахстана готовиться к ЕНТ (математика, физика, информатика).

Правила:
- Отвечай ТОЛЬКО по школьной программе ЕНТ и только по условию задачи ниже. На любой посторонний, личный или вредный вопрос — вежливо откажись и верни разговор к задаче.
- Никогда не проси и не сохраняй личные данные ученика (имя, номер телефона, адрес, школу и т.п.).
- Общайся уважительно, спокойно и уместно для несовершеннолетнего.
- Отвечай коротко (2–4 предложения), по делу, на языке условия задачи.
- Следуй инструкции режима ниже дословно — особенно запрет называть ответ в режиме подсказки.`;

type AssistantQuestion = {
  type: QuestionType;
  body: QuestionBody;
  explanation: Explanation | null;
};

function formatOptions(options: { id: string; content: string }[]): string {
  return options.map((o) => `${o.id}) ${o.content}`).join('\n');
}

function formatQuestionBody(type: QuestionType, body: QuestionBody): string {
  if (type === 'single') {
    const b = body as SingleBody;
    return `Условие: ${b.stem}\nВарианты:\n${formatOptions(b.options)}\nПравильный ответ: ${b.correct}`;
  }
  if (type === 'multi') {
    const b = body as MultiBody;
    return `Условие: ${b.stem}\nВарианты:\n${formatOptions(b.options)}\nПравильные ответы: ${b.correct.join(', ')}`;
  }
  const b = body as MatchingBody;
  const correct = Object.entries(b.correct)
    .map(([left, right]) => `${left} → ${right}`)
    .join('; ');
  return `Условие: ${b.stem}\nЛевый список:\n${formatOptions(b.left)}\nПравый список: ${b.right.join(', ')}\nПравильные соответствия: ${correct}`;
}

function formatUserAnswer(type: QuestionType, userAnswer: unknown): string {
  if (userAnswer == null) return 'Ответ ученика: пока не отвечал.';
  if (type === 'multi' && Array.isArray(userAnswer)) {
    return `Ответ ученика: ${userAnswer.join(', ')}`;
  }
  if (type === 'matching' && typeof userAnswer === 'object') {
    const pairs = Object.entries(userAnswer as Record<string, string>)
      .map(([left, right]) => `${left} → ${right}`)
      .join('; ');
    return `Ответ ученика: ${pairs}`;
  }
  return `Ответ ученика: ${String(userAnswer)}`;
}

const MODE_INSTRUCTIONS: Record<AssistantMode, string> = {
  hint:
    'Режим: подсказка ДО проверки ответа. Направь ход мысли ученика к решению наводящим вопросом или указанием на нужную формулу/шаг. НЕ называй правильный вариант или итоговый ответ напрямую.',
  'why-wrong':
    'Режим: ученик уже проверил ответ и ошибся. Объясни, в чём ошибка его рассуждения, и укажи верный путь к решению.',
  simpler:
    'Режим: объясни решение задачи проще и понятнее, чем в стандартном разборе ниже — на бытовых примерах или по шагам.',
};

/** Сборка скоуп-контекста для модели: условие + правильный ответ + ответ ученика + разбор + инструкция режима. */
export function buildAssistantContext(
  question: AssistantQuestion,
  userAnswer: unknown,
  mode: AssistantMode
): string {
  const parts = [formatQuestionBody(question.type, question.body), formatUserAnswer(question.type, userAnswer)];

  if (question.explanation) {
    const text = question.explanation.blocks.map((b) => b.value).join(' ');
    parts.push(`Готовый разбор задачи: ${text}`);
  }

  parts.push(MODE_INSTRUCTIONS[mode]);

  return parts.join('\n\n');
}
