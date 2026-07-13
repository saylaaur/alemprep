'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';
import { DIAGNOSTIC_BLUEPRINT, QUESTION_POINTS, scoreAnswer } from '@/lib/exam';
import { getPairExamBlocks, type ExamBlock, type ExamContext } from './queries';
import type { QuestionType, QuestionBody, Locale, SecondSubject } from '@/types/db';

/**
 * Старт диагностики: пара предметов берётся из профиля (second_subject) —
 * пользователь её не выбирает, диагностика идёт один раз сразу после
 * онбординга. Блюпринт короче полного пробника (DIAGNOSTIC_BLUEPRINT).
 *
 * ОДНА сессия на всю диагностику (а не по одной на блок, как в пробнике):
 * mode='diagnostic', subject_id=NULL, т.к. сессия охватывает оба предмета.
 * Разрез по предметам/темам на результатах строится клиентом из questions
 * блоков — сама БД про деление на блоки не знает.
 */
export async function startDiagnostic(input: { locale: Locale }): Promise<
  { sessionId: string; blocks: ExamBlock[]; contexts: [string, ExamContext][] } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('second_subject')
    .eq('id', user.id)
    .maybeSingle();
  const second = (profileRow as { second_subject: SecondSubject | null } | null)?.second_subject;
  if (!second) return { error: 'no_second_subject' };

  const data = await getPairExamBlocks(second, input.locale, DIAGNOSTIC_BLUEPRINT);
  if (!data) return { error: 'subjects not found' };

  const totalQuestions = data.blocks.reduce((sum, b) => sum + b.questions.length, 0);
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      subject_id: null,
      mode: 'diagnostic' as const,
      total_questions: totalQuestions,
      correct_count: 0,
      score: 0,
    })
    .select('id')
    .single();
  if (error || !session) return { error: error?.message ?? 'failed to create session' };

  return {
    sessionId: session.id as string,
    blocks: data.blocks,
    contexts: Array.from(data.contexts.entries()),
  };
}

type DiagnosticResult = {
  questionId: string;
  givenAnswer: unknown;
  timeSpentMs: number;
};

/**
 * Клон finishExamSession МИНУС XP/стрик/достижения — диагностика замеряет,
 * а не тренирует. Та же идемпотентность (условный UPDATE finished_at IS NULL
 * + fallback на гонку) и то же правило attempts (только givenAnswer != null).
 */
export async function finishDiagnostic(input: {
  sessionId: string;
  results: DiagnosticResult[];
}): Promise<{ ok: true; correctCount: number; score: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  const { data: existingSession } = await supabase
    .from('sessions')
    .select('correct_count, score, finished_at, mode')
    .eq('id', input.sessionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!existingSession) return { error: 'session not found' };
  const prior = existingSession as {
    correct_count: number | null;
    score: number | null;
    finished_at: string | null;
    mode: string;
  };
  if (prior.mode !== 'diagnostic') return { error: 'wrong session mode' };
  if (prior.finished_at) {
    return { ok: true as const, correctCount: prior.correct_count ?? 0, score: prior.score ?? 0 };
  }

  // Баллы считаем только по данным из БД — ответы приходят с клиента, правильность
  // и баллы ему не доверяем (тот же принцип, что в finishExamSession).
  const questionIds = input.results.map((r) => r.questionId);
  const { data: qRows } = questionIds.length > 0
    ? await supabase.from('questions').select('id, type, body').in('id', questionIds)
    : { data: [] };
  const qById = new Map(
    (qRows ?? []).map((q) => [q.id as string, { type: q.type as QuestionType, body: q.body as QuestionBody }])
  );

  const scored = input.results.map((r) => {
    const q = qById.get(r.questionId);
    const points = q ? scoreAnswer(q.type, q.body, r.givenAnswer) : 0;
    const isCorrect = q ? points === QUESTION_POINTS[q.type] : false;
    return { ...r, points, isCorrect };
  });

  const correctCount = scored.filter((s) => s.isCorrect).length;
  const score = scored.reduce((sum, s) => sum + s.points, 0);

  const { data: updatedRows, error: sessionError } = await supabase
    .from('sessions')
    .update({ correct_count: correctCount, score, finished_at: new Date().toISOString() })
    .eq('id', input.sessionId)
    .eq('user_id', user.id)
    .is('finished_at', null)
    .select('correct_count, score');

  if (sessionError) return { error: sessionError.message };

  if (!updatedRows || updatedRows.length === 0) {
    // Кто-то другой выиграл гонку и завершил сессию между проверкой и update.
    const { data: raceWinner } = await supabase
      .from('sessions')
      .select('correct_count, score')
      .eq('id', input.sessionId)
      .eq('user_id', user.id)
      .maybeSingle();
    const winner = raceWinner as { correct_count: number | null; score: number | null } | null;
    return { ok: true as const, correctCount: winner?.correct_count ?? 0, score: winner?.score ?? 0 };
  }

  // В attempts — только отвеченные (given_answer в схеме NOT NULL). Баллы выше
  // посчитаны по ВСЕМ результатам (неотвеченный = 0 баллов).
  const answered = scored.filter((s) => s.givenAnswer != null);
  if (answered.length > 0) {
    const { error: attemptsError } = await supabase.from('attempts').insert(
      answered.map((s) => ({
        user_id: user.id,
        question_id: s.questionId,
        session_id: input.sessionId,
        given_answer: s.givenAnswer,
        is_correct: s.isCorrect,
        time_spent_ms: s.timeSpentMs,
      }))
    );
    if (attemptsError) {
      await supabase
        .from('sessions')
        .update({ correct_count: prior.correct_count, score: prior.score, finished_at: prior.finished_at })
        .eq('id', input.sessionId)
        .eq('user_id', user.id);
      return { error: attemptsError.message };
    }
  }

  revalidatePath('/[locale]/(app)/dashboard', 'page');
  return { ok: true as const, correctCount, score };
}
