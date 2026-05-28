'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';

type RecordInput = {
  questionId: string;
  givenAnswer: unknown;
  isCorrect: boolean;
  timeSpentMs: number;
};

export async function recordAttempt(input: RecordInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'unauthenticated' };

  // 1. Записываем попытку
  const { error: insertError } = await supabase.from('attempts').insert({
    user_id: user.id,
    question_id: input.questionId,
    given_answer: input.givenAnswer,
    is_correct: input.isCorrect,
    time_spent_ms: input.timeSpentMs,
  });
  if (insertError) {
    return { ok: false as const, error: insertError.message };
  }

  // 2. Обновляем стрик и last_active_date
  const today = new Date().toISOString().slice(0, 10);
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_streak, last_active_date')
    .eq('id', user.id)
    .maybeSingle();

  if (profile) {
    const last = profile.last_active_date as string | null;
    let newStreak = profile.current_streak as number;

    if (last !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      if (last === yesterdayStr) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }

      await supabase
        .from('profiles')
        .update({ current_streak: newStreak, last_active_date: today })
        .eq('id', user.id);
    }
  }

  // Дашборд должен пересчитаться при следующем заходе
  revalidatePath('/[locale]/(app)/dashboard', 'page');

  return { ok: true as const };
}
