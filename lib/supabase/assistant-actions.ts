'use server';

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from './server';
import { localDateStr } from '@/lib/streak';
import { AI_DAILY_LIMIT, ASSISTANT_SYSTEM_PROMPT, buildAssistantContext, resolveModel, type AssistantMode } from '@/lib/assistant';
import type { Explanation, QuestionBody, QuestionType } from '@/types/db';

const ASSISTANT_MAX_TOKENS = 350;

export type AskAssistantResult =
  | { ok: true; answer: string; remaining: number }
  | {
      ok: false;
      error: 'unauthenticated' | 'not-found' | 'daily-limit' | 'usage-write-failed' | 'model-error';
      resetsAt?: string;
    };

/** Начало следующих суток по локальному времени сервера (тот же базис, что localDateStr). */
function nextLocalMidnightIso(): string {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next.toISOString();
}

/**
 * ИИ-помощь по конкретной задаче (Слой 2). Условие и правильный ответ грузим
 * НА СЕРВЕРЕ из БД по questionId — клиенту не доверяем. Дневной лимит
 * проверяем и инкрементируем ДО вызова модели, чтобы не платить за отказ.
 */
export async function askAssistant(input: {
  questionId: string;
  mode: AssistantMode;
  userAnswer: unknown;
}): Promise<AskAssistantResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { data: questionRow } = await supabase
    .from('questions')
    .select('type, body, explanation')
    .eq('id', input.questionId)
    .maybeSingle();
  if (!questionRow) return { ok: false, error: 'not-found' };

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
  const context = buildAssistantContext(question, input.userAnswer, input.mode);

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

    return { ok: true, answer, remaining: AI_DAILY_LIMIT - (currentCount + 1) };
  } catch {
    return { ok: false, error: 'model-error' };
  }
}
