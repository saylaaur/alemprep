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

export async function createExamSession(input: {
  subjectId: string;
  totalQuestions: number;
}): Promise<{ sessionId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      subject_id: input.subjectId,
      mode: 'mock_exam' as const,
      total_questions: input.totalQuestions,
      correct_count: 0,
      score: 0,
    })
    .select('id')
    .single();

  if (error || !data) return { error: error?.message ?? 'failed to create session' };
  return { sessionId: data.id as string };
}

type ExamResult = {
  questionId: string;
  isCorrect: boolean;
  givenAnswer: unknown;
  timeSpentMs: number;
};

export async function finishExamSession(input: {
  sessionId: string;
  results: ExamResult[];
}): Promise<{ ok: true; correctCount: number; score: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  const correctCount = input.results.filter((r) => r.isCorrect).length;
  const total = input.results.length;
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const { error: sessionError } = await supabase
    .from('sessions')
    .update({ correct_count: correctCount, score, finished_at: new Date().toISOString() })
    .eq('id', input.sessionId)
    .eq('user_id', user.id);

  if (sessionError) return { error: sessionError.message };

  if (input.results.length > 0) {
    await supabase.from('attempts').insert(
      input.results.map((r) => ({
        user_id: user.id,
        question_id: r.questionId,
        session_id: input.sessionId,
        given_answer: r.givenAnswer,
        is_correct: r.isCorrect,
        time_spent_ms: r.timeSpentMs,
      }))
    );
  }

  revalidatePath('/[locale]/(app)/progress', 'page');
  return { ok: true as const, correctCount, score };
}
