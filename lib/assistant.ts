/**
 * Чистая логика ИИ-ассистента (Слой 2, docs/ai-assistant-design.md): дневной
 * лимит, режимы и сборка скоуп-контекста задачи для модели. Без сети и БД —
 * тестируется напрямую. Вызов модели и лимит — в lib/supabase/assistant-actions.ts.
 */

import type { Explanation, MatchingBody, MultiBody, QuestionBody, QuestionType, SingleBody } from '@/types/db';

/** Базовая дневная норма запросов к ИИ-ассистенту — каждому поровну (v1, без бонусов). */
export const AI_DAILY_LIMIT = 5;

/**
 * Глобальный дневной потолок запросов ко всем ученикам разом — предохранитель
 * бюджета пилота (~$50/мес из кармана партнёра). 600 запросов/день ≈ $1.5/день
 * ≈ $45/мес, с запасом под лимит. Персональный лимит (AI_DAILY_LIMIT) не
 * спасает от перерасхода при масштабе школы: 300 учеников × 5 = 1500/день.
 */
export const AI_GLOBAL_DAILY_REQUEST_LIMIT = 600;

/** Чистая проверка глобального дневного бюджета — тестируется без БД. */
export function isGlobalBudgetExhausted(requestCount: number): boolean {
  return requestCount >= AI_GLOBAL_DAILY_REQUEST_LIMIT;
}

/** Выбор модели через env, с дефолтом — тот же подход, что в scripts/lib/models.ts. */
export function resolveModel(envVar: string, fallback: string): string {
  return process.env[envVar]?.trim() || fallback;
}

/** Общий источник истины для типа режима И рантайм-проверки (TS стирается на границе server action). */
export const ASSISTANT_MODES = ['hint', 'why-wrong', 'simpler', 'ask'] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

/** Диалог по одной задаче ограничен: не больше реплик ученика и не длиннее свободный вопрос. */
export const ASSISTANT_MAX_TURNS_PER_QUESTION = 4;
export const ASSISTANT_MAX_QUESTION_LENGTH = 300;

/** Реплика диалога — форма 1:1 со строкой ai_turns. */
export type AssistantTurn = {
  role: 'student' | 'assistant';
  mode: AssistantMode | null;
  text: string;
};

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
- НИКОГДА не используй markdown-разметку: никаких # заголовков, никакого **жирного текста**, никаких списков через * или -. Только обычный текст.
- Формулы — только внутри $...$.
- Отвечай 2–4 короткими абзацами, разделяя их пустой строкой. Не длиннее — ответ обрезается на середине.
- Следуй инструкции режима ниже дословно — особенно запрет называть ответ в режиме подсказки.`;

type AssistantQuestion = {
  type: QuestionType;
  body: QuestionBody;
  explanation: Explanation | null;
};

function formatOptions(options: { id: string; content: string }[]): string {
  return options.map((o) => `${o.id}) ${o.content}`).join('\n');
}

/** Правильный ответ попадает в контекст ТОЛЬКО когда answerRevealed — иначе подсказка/ask до проверки его выдаст. */
function formatQuestionBody(type: QuestionType, body: QuestionBody, answerRevealed: boolean): string {
  if (type === 'single') {
    const b = body as SingleBody;
    const parts = [`Условие: ${b.stem}`, `Варианты:\n${formatOptions(b.options)}`];
    if (answerRevealed) parts.push(`Правильный ответ: ${b.correct}`);
    return parts.join('\n');
  }
  if (type === 'multi') {
    const b = body as MultiBody;
    const parts = [`Условие: ${b.stem}`, `Варианты:\n${formatOptions(b.options)}`];
    if (answerRevealed) parts.push(`Правильные ответы: ${b.correct.join(', ')}`);
    return parts.join('\n');
  }
  const b = body as MatchingBody;
  const parts = [`Условие: ${b.stem}`, `Левый список:\n${formatOptions(b.left)}`, `Правый список: ${b.right.join(', ')}`];
  if (answerRevealed) {
    const correct = Object.entries(b.correct)
      .map(([left, right]) => `${left} → ${right}`)
      .join('; ');
    parts.push(`Правильные соответствия: ${correct}`);
  }
  return parts.join('\n');
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

const MODE_INSTRUCTIONS: Record<Exclude<AssistantMode, 'ask'>, string> = {
  hint:
    'Режим: подсказка ДО проверки ответа. Направь ход мысли ученика к решению наводящим вопросом или указанием на нужную формулу/шаг. НЕ называй правильный вариант или итоговый ответ напрямую.',
  'why-wrong':
    'Режим: ученик уже проверил ответ и ошибся. Объясни, в чём ошибка его рассуждения, и укажи верный путь к решению.',
  simpler:
    'Режим: объясни решение задачи проще и понятнее, чем в стандартном разборе ниже — на бытовых примерах или по шагам.',
};

/** Режим 'ask' (свободный вопрос) — запрет называть ответ зависит от того, раскрыт ли он уже. */
const ASK_INSTRUCTION_HIDDEN =
  'Режим: ученик задаёт свой вопрос по задаче ДО проверки ответа. Отвечай по существу вопроса, но НЕ называй правильный вариант или итоговый ответ напрямую — как в режиме подсказки.';
const ASK_INSTRUCTION_REVEALED =
  'Режим: ученик задаёт свой вопрос по задаче ПОСЛЕ проверки ответа. Можно свободно называть правильный ответ и опираться на разбор.';

/** Русские метки пресетов — ТОЛЬКО для сборки контекста модели (транскрипт истории), не для UI (там next-intl). */
const STUDENT_PRESET_LABELS: Record<Exclude<AssistantMode, 'ask'>, string> = {
  hint: 'Подсказка',
  'why-wrong': 'Почему неверно',
  simpler: 'Объясни проще',
};

/** Реплика ученика по пресету → русская метка; свободный вопрос (mode=null) → буквальный текст. */
export function studentTurnLabel(turn: AssistantTurn): string {
  if (turn.mode && turn.mode !== 'ask') return STUDENT_PRESET_LABELS[turn.mode];
  return turn.text;
}

function formatHistory(history: AssistantTurn[]): string {
  return history
    .map((turn) => (turn.role === 'student' ? `Ученик: ${studentTurnLabel(turn)}` : `Ассистент: ${turn.text}`))
    .join('\n');
}

/** Разбивает ответ модели на абзацы по пустым строкам — для рендера по одному <MathText> на абзац. */
export function splitAssistantAnswer(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

type BuildContextOptions = {
  history?: AssistantTurn[];
  userQuestion?: string;
  answerRevealed?: boolean;
};

/**
 * Сборка скоуп-контекста для модели: условие (+ правильный ответ и готовый
 * разбор — ТОЛЬКО если answerRevealed) + ответ ученика + история диалога +
 * инструкция режима. options опционален для обратной совместимости.
 */
export function buildAssistantContext(
  question: AssistantQuestion,
  userAnswer: unknown,
  mode: AssistantMode,
  options?: BuildContextOptions
): string {
  const answerRevealed = options?.answerRevealed ?? false;
  const history = options?.history ?? [];

  const parts = [
    formatQuestionBody(question.type, question.body, answerRevealed),
    formatUserAnswer(question.type, userAnswer),
  ];

  if (answerRevealed && question.explanation) {
    const text = question.explanation.blocks
      .map((block) => ('value' in block ? block.value : [block.columns, ...block.rows].flat().join(' | ')))
      .join(' ');
    parts.push(`Готовый разбор задачи: ${text}`);
  }

  if (history.length > 0) {
    parts.push(`История диалога:\n${formatHistory(history)}`);
  }

  if (mode === 'ask') {
    parts.push(answerRevealed ? ASK_INSTRUCTION_REVEALED : ASK_INSTRUCTION_HIDDEN);
    if (options?.userQuestion) parts.push(`Вопрос ученика: ${options.userQuestion}`);
  } else {
    parts.push(MODE_INSTRUCTIONS[mode]);
  }

  return parts.join('\n\n');
}
