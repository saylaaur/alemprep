'use server';

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from './server';
import { localDateStr } from '@/lib/streak';
import {
  AI_DAILY_LIMIT,
  ASSISTANT_MAX_QUESTION_LENGTH,
  ASSISTANT_MAX_TURNS_PER_QUESTION,
  ASSISTANT_MODES,
  ASSISTANT_SYSTEM_PROMPT,
  buildAssistantContext,
  resolveModel,
  type AssistantMode,
  type AssistantTurn,
} from '@/lib/assistant';
import type { Explanation, QuestionBody, QuestionType } from '@/types/db';

const ASSISTANT_MAX_TOKENS = 350;

export type AskAssistantResult =
  | { ok: true; answer: string; remaining: number; history: AssistantTurn[] }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'not-found'
        | 'daily-limit'
        | 'usage-write-failed'
        | 'model-error'
        | 'invalid-input'
        | 'question-limit';
      resetsAt?: string;
    };

type AiTurnRow = { role: 'student' | 'assistant'; mode: AssistantMode | null; text: unknown };

/** Начало следующих суток по локальному времени сервера (тот же базис, что localDateStr). */
function nextLocalMidnightIso(): string {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next.toISOString();
}

/**
 * ИИ-помощь по конкретной задаче (Слой 2). Условие, правильный ответ и вся
 * история диалога грузятся НА СЕРВЕРЕ из БД — клиенту не доверяем ни
 * содержимое, ни признак «ответ раскрыт» (answerRevealed): их подделка иначе
 * обходила бы системный промпт и выдавала ответ раньше времени. userAnswer —
 * только черновой (ещё не сохранённый) ответ для до-проверочного контекста,
 * не security-поле: как только есть попытка в БД, её given_answer перекрывает
 * клиентский.
 */
export async function askAssistant(input: {
  questionId: string;
  mode: AssistantMode;
  userAnswer?: unknown;
  userQuestion?: string;
}): Promise<AskAssistantResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  // Рантайм-проверка обязательна — TS-тип AssistantMode стирается на границе server action.
  if (!ASSISTANT_MODES.includes(input.mode)) {
    return { ok: false, error: 'invalid-input' };
  }

  let userQuestion: string | undefined;
  if (input.mode === 'ask') {
    userQuestion = (input.userQuestion ?? '').trim();
    if (userQuestion.length === 0 || userQuestion.length > ASSISTANT_MAX_QUESTION_LENGTH) {
      return { ok: false, error: 'invalid-input' };
    }
  }

  const { data: questionRow } = await supabase
    .from('questions')
    .select('type, body, explanation')
    .eq('id', input.questionId)
    .maybeSingle();
  if (!questionRow) return { ok: false, error: 'not-found' };

  const [historyRes, attemptRes] = await Promise.all([
    supabase
      .from('ai_turns')
      .select('role, mode, text')
      .eq('user_id', user.id)
      .eq('question_id', input.questionId)
      .order('created_at', { ascending: true }),
    supabase
      .from('attempts')
      .select('given_answer')
      .eq('user_id', user.id)
      .eq('question_id', input.questionId)
      // Попытки пишут четыре места, но правильный ответ ученик видит ТОЛЬКО в
      // тренажёре — диагностика/weekly/пробник это мини-экзамены без обратной
      // связи, их попытки идут с session_id. Без этого фильтра прошедший weekly
      // с задачей X ученик открыл бы X в тренажёре и получил бы по кнопке
      // «Подсказка» готовый ответ, которого никогда не видел (плюс утечка
      // ответов будущих тестов).
      .is('session_id', null)
      // Одну задачу в тренажёре решают повторно — без order+limit вернётся
      // произвольная строка, не последняя.
      .order('attempted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const history: AssistantTurn[] = ((historyRes.data ?? []) as AiTurnRow[]).map((r) => ({
    role: r.role,
    mode: r.mode,
    text: String(r.text).slice(0, 2000),
  }));

  const attemptRow = attemptRes.data as { given_answer: unknown } | null;
  const answerRevealed = !!attemptRow;
  const userAnswer = attemptRow ? attemptRow.given_answer : input.userAnswer;

  const studentTurnCount = history.filter((t) => t.role === 'student').length;
  if (studentTurnCount >= ASSISTANT_MAX_TURNS_PER_QUESTION) {
    return { ok: false, error: 'question-limit' };
  }

  const today = localDateStr();
  const { data: usageRow } = await supabase
    .from('ai_usage')
    .select('count')
    .eq('user_id', user.id)
    .eq('usage_date', today)
    .maybeSingle();
  const currentCount = (usageRow as { count: number } | null)?.count ?? 0;

  if (currentCount >= AI_DAILY_LIMIT) {
    return { ok: false, error: 'daily-limit', resetsAt: nextLocalMidnightIso() };
  }

  // Инкремент — вручную select-затем-insert/update (upsert), т.к. общий
  // in-memory тест-мок не поддерживает настоящий upsert. 0 затронутых строк
  // на update — ошибка (урок 0008: RLS может молча заблокировать запись).
  if (usageRow) {
    const { data: updated, error } = await supabase
      .from('ai_usage')
      .update({ count: currentCount + 1 })
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .select('count');
    if (error || !updated || updated.length === 0) {
      return { ok: false, error: 'usage-write-failed' };
    }
  } else {
    const { error } = await supabase.from('ai_usage').insert({ user_id: user.id, usage_date: today, count: 1 });
    if (error) return { ok: false, error: 'usage-write-failed' };
  }

  const question = questionRow as { type: QuestionType; body: QuestionBody; explanation: Explanation | null };
  const context = buildAssistantContext(question, userAnswer, input.mode, { history, userQuestion, answerRevealed });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'model-error' };

  try {
    const client = new Anthropic({ apiKey });
    const model = resolveModel('ASSISTANT_MODEL', 'claude-haiku-4-5-20251001');
    const response = await client.messages.create({
      model,
      max_tokens: ASSISTANT_MAX_TOKENS,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    });
    const answer = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    const studentTurn: AssistantTurn = {
      role: 'student',
      mode: input.mode === 'ask' ? null : input.mode,
      text: input.mode === 'ask' ? (userQuestion as string) : input.mode,
    };
    const assistantTurn: AssistantTurn = { role: 'assistant', mode: input.mode, text: answer };

    // Best-effort: не проваливаем уже оплаченный и полученный ответ, если лог не записался.
    await supabase.from('ai_turns').insert([
      { user_id: user.id, question_id: input.questionId, role: studentTurn.role, mode: studentTurn.mode, text: studentTurn.text },
      { user_id: user.id, question_id: input.questionId, role: assistantTurn.role, mode: assistantTurn.mode, text: assistantTurn.text },
    ]);

    return {
      ok: true,
      answer,
      remaining: AI_DAILY_LIMIT - (currentCount + 1),
      history: [...history, studentTurn, assistantTurn],
    };
  } catch {
    return { ok: false, error: 'model-error' };
  }
}

/** История диалога по задаче — для первичной загрузки при раскрытии панели ассистента. */
export async function getAssistantHistory(questionId: string): Promise<AssistantTurn[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('ai_turns')
    .select('role, mode, text')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });
  if (error) return [];

  return ((data ?? []) as AiTurnRow[]).map((r) => ({
    role: r.role,
    mode: r.mode,
    text: String(r.text).slice(0, 2000),
  }));
}
