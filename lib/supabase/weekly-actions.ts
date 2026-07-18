'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';
import { QUESTION_POINTS, scoreAnswer } from '@/lib/exam';
import { advanceStreak, localDateStr } from '@/lib/streak';
import { XP_PER_CORRECT, WEEKLY_TEST_BONUS } from '@/lib/gamification';
import {
  WEEKLY_BLUEPRINT,
  isSameIsoWeek,
  nextIsoWeekMonday,
  pickFreshBalancedByTopic,
} from '@/lib/weekly';
import { getPairExamBlocks, type ExamBlock, type ExamContext } from './queries';
import type { QuestionType, QuestionBody, Locale, SecondSubject } from '@/types/db';

/**
 * Старт еженедельного теста: пара из профиля (second_subject), как диагностика —
 * ОДНА сессия на тест (subject_id=NULL), пользователь пару не выбирает.
 *
 * Доступность — раз в ISO-неделю (понедельник-старт): если уже есть weekly-сессия
 * за текущую неделю, возвращаем ошибку с датой следующего доступного теста.
 *
 * Задачи предпочитаем свежие (не отвеченные пользователем раньше) —
 * pickFreshBalancedByTopic инжектируется в getPairExamBlocks как pick,
 * сам getPairExamBlocks ничего не знает о «свежести».
 */
export async function startWeeklyTest(input: { locale: Locale }): Promise<
  | { sessionId: string; blocks: ExamBlock[]; contexts: [string, ExamContext][] }
  | { error: string; nextAvailableAt?: string }
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

  const now = new Date();
  const { data: weeklySessions } = await supabase
    .from('sessions')
    .select('started_at')
    .eq('user_id', user.id)
    .eq('mode', 'weekly');
  const alreadyThisWeek = ((weeklySessions ?? []) as { started_at: string }[]).some((s) =>
    isSameIsoWeek(new Date(s.started_at), now)
  );
  if (alreadyThisWeek) {
    return {
      error: 'already-done-this-week',
      nextAvailableAt: nextIsoWeekMonday(now).toISOString(),
    };
  }

  // Предпочитаем задачи, которые пользователь ещё не видел — не блокер, если
  // банк тонкий (см. lib/weekly.ts pickFreshBalancedByTopic).
  const { data: attemptRows } = await supabase
    .from('attempts')
    .select('question_id')
    .eq('user_id', user.id);
  const exclude = new Set(
    ((attemptRows ?? []) as { question_id: string }[]).map((r) => r.question_id)
  );

  const data = await getPairExamBlocks(second, input.locale, WEEKLY_BLUEPRINT, (pool, bp) =>
    pickFreshBalancedByTopic(pool, exclude, bp)
  );
  if (!data) return { error: 'subjects not found' };

  const totalQuestions = data.blocks.reduce((sum, b) => sum + b.questions.length, 0);
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      subject_id: null,
      mode: 'weekly' as const,
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

type WeeklyResult = {
  questionId: string;
  givenAnswer: unknown;
  timeSpentMs: number;
};

/**
 * Клон finishExamSession: ownership, идемпотентность (условный UPDATE
 * finished_at IS NULL + fallback на гонку), баллы только по данным из БД,
 * attempts только по отвеченным (given_answer NOT NULL в схеме). В отличие
 * от finishDiagnostic — начисляет XP и продлевает стрик (это вовлечение,
 * диагностика только измеряет). Без достижений — вне рамок v1.
 */
export async function finishWeeklyTest(input: {
  sessionId: string;
  results: WeeklyResult[];
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
  if (prior.mode !== 'weekly') return { error: 'wrong session mode' };
  if (prior.finished_at) {
    return { ok: true as const, correctCount: prior.correct_count ?? 0, score: prior.score ?? 0 };
  }

  // Баллы считаем только по данным из БД — ответы приходят с клиента, правильность
  // и баллы ему не доверяем (тот же принцип, что в finishExamSession/finishDiagnostic).
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

  // XP + стрик за еженедельный тест: +10 за верный ответ + разовый бонус.
  // В отличие от диагностики — это вовлечение, а не только замер.
  const { data: weeklyProfile } = await supabase
    .from('profiles')
    .select('xp, current_streak, last_active_date, longest_streak, streak_freezes')
    .eq('id', user.id)
    .maybeSingle();
  const profile = weeklyProfile as {
    xp: number | null;
    current_streak: number | null;
    last_active_date: string | null;
    longest_streak: number | null;
    streak_freezes: number | null;
  } | null;
  const xpGain = correctCount * XP_PER_CORRECT + WEEKLY_TEST_BONUS;
  const profileUpdate: Record<string, unknown> = {
    xp: (profile?.xp ?? 0) + xpGain,
  };
  if (profile) {
    const nextStreak = advanceStreak({
      lastActiveDate: profile.last_active_date,
      currentStreak: profile.current_streak ?? 0,
      today: localDateStr(),
      streakFreezes: profile.streak_freezes ?? 0,
    });
    if (nextStreak) {
      profileUpdate.current_streak = nextStreak.streak;
      profileUpdate.last_active_date = nextStreak.lastActiveDate;
      profileUpdate.streak_freezes = nextStreak.streakFreezes;
      if (nextStreak.freezeUsed) profileUpdate.last_freeze_used_date = nextStreak.lastActiveDate;
      if (nextStreak.streak > (profile.longest_streak ?? 0)) {
        profileUpdate.longest_streak = nextStreak.streak;
      }
    }
  }
  const { error: profileError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id);
  if (profileError) {
    await supabase
      .from('attempts')
      .delete()
      .eq('session_id', input.sessionId)
      .eq('user_id', user.id);
    await supabase
      .from('sessions')
      .update({
        correct_count: prior.correct_count,
        score: prior.score,
        finished_at: prior.finished_at,
      })
      .eq('id', input.sessionId)
      .eq('user_id', user.id);
    return { error: profileError.message };
  }

  revalidatePath('/[locale]/(app)/dashboard', 'page');
  return { ok: true as const, correctCount, score };
}
