'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';
import {
  EXAM_SECOND_SUBJECTS,
  QUESTION_POINTS,
  scoreAnswer,
  type ExamSecondSubject,
} from '@/lib/exam';
import { advanceStreak, localDateStr } from '@/lib/streak';
import {
  XP_PER_CORRECT,
  EXAM_BLOCK_BONUS,
  evaluateAchievements,
  type AchievementSnapshot,
} from '@/lib/gamification';
import { getPairExamBlocks, type ExamBlock, type ExamContext } from './queries';
import type { QuestionType, QuestionBody, Locale } from '@/types/db';

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

  // 2. Обновляем стрик, рекорд стрика и XP. Локальная дата — тот же базис,
  // что у getTodayAttemptsCount; toISOString здесь давал бы UTC-сдвиг.
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_streak, last_active_date, longest_streak, xp')
    .eq('id', user.id)
    .maybeSingle();

  if (profile) {
    const next = advanceStreak({
      lastActiveDate: profile.last_active_date as string | null,
      currentStreak: (profile.current_streak as number | null) ?? 0,
      today: localDateStr(),
    });
    const update: Record<string, unknown> = {};
    if (next) {
      update.current_streak = next.streak;
      update.last_active_date = next.lastActiveDate;
      const longest = (profile.longest_streak as number | null) ?? 0;
      if (next.streak > longest) update.longest_streak = next.streak;
    }
    if (input.isCorrect) {
      update.xp = ((profile.xp as number | null) ?? 0) + XP_PER_CORRECT;
    }
    if (Object.keys(update).length > 0) {
      await supabase.from('profiles').update(update).eq('id', user.id);
    }
  }

  // 3. Достижения (контекст практики — без exam)
  await awardAchievements(supabase, user.id, await buildAchievementSnapshot(supabase, user.id));

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

export type PairExamBlock = ExamBlock & { sessionId: string };

/**
 * Старт пробника-пары: собирает оба блока (математика + второй предмет)
 * и создаёт по сессии на блок. Map контекстов сериализуется в entries —
 * через границу server action Map не проходит.
 */
export async function startPairExam(input: {
  second: ExamSecondSubject;
  locale: Locale;
}): Promise<
  { blocks: PairExamBlock[]; contexts: [string, ExamContext][] } | { error: string }
> {
  if (!EXAM_SECOND_SUBJECTS.includes(input.second)) return { error: 'invalid subject' };

  const data = await getPairExamBlocks(input.second, input.locale);
  if (!data) return { error: 'subjects not found' };

  const blocks: PairExamBlock[] = [];
  for (const block of data.blocks) {
    const res = await createExamSession({
      subjectId: block.subjectId,
      totalQuestions: block.questions.length,
    });
    if ('error' in res) return { error: res.error };
    blocks.push({ ...block, sessionId: res.sessionId });
  }

  return { blocks, contexts: Array.from(data.contexts.entries()) };
}

type ExamResult = {
  questionId: string;
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

  // Идемпотентность: если сессия уже завершена (finished_at проставлен) —
  // возвращаем прежний результат, ничего не пересчитывая и НЕ начисляя XP,
  // бонусы и достижения повторно. Защищает от двойного вызова (двойной клик,
  // ретрай после флап-ответа). Ownership проверяем тем же user_id.
  const { data: existingSession } = await supabase
    .from('sessions')
    .select('correct_count, score, finished_at')
    .eq('id', input.sessionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!existingSession) return { error: 'session not found' };
  const prior = existingSession as {
    correct_count: number | null;
    score: number | null;
    finished_at: string | null;
  };
  if (prior.finished_at) {
    return {
      ok: true as const,
      correctCount: prior.correct_count ?? 0,
      score: prior.score ?? 0,
    };
  }

  // Баллы ЕНТ (с частичным зачётом multi/matching) считаем только по данным
  // из БД — ответы приходят с клиента, правильность и баллы ему не доверяем.
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

  const { error: sessionError } = await supabase
    .from('sessions')
    .update({ correct_count: correctCount, score, finished_at: new Date().toISOString() })
    .eq('id', input.sessionId)
    .eq('user_id', user.id);

  if (sessionError) return { error: sessionError.message };

  if (scored.length > 0) {
    await supabase.from('attempts').insert(
      scored.map((s) => ({
        user_id: user.id,
        question_id: s.questionId,
        session_id: input.sessionId,
        given_answer: s.givenAnswer,
        is_correct: s.isCorrect,
        time_spent_ms: s.timeSpentMs,
      }))
    );
  }

  // XP за пробник: +10 за верный ответ + разовый бонус за завершённый блок.
  // Пробник не проходит через recordAttempt, поэтому XP начисляем здесь.
  const { data: examProfile } = await supabase
    .from('profiles')
    .select('xp')
    .eq('id', user.id)
    .maybeSingle();
  const xpGain = correctCount * XP_PER_CORRECT + EXAM_BLOCK_BONUS;
  await supabase
    .from('profiles')
    .update({ xp: ((examProfile as { xp: number } | null)?.xp ?? 0) + xpGain })
    .eq('id', user.id);

  // Достижения: контекст пробника — доля балла от максимума блока (score / maxBlockScore).
  const maxBlockScore = input.results.reduce((sum, r) => {
    const q = qById.get(r.questionId);
    return sum + (q ? QUESTION_POINTS[q.type] : 0);
  }, 0);
  await awardAchievements(supabase, user.id, {
    ...(await buildAchievementSnapshot(supabase, user.id)),
    exam: { completed: true, scoreRatio: maxBlockScore > 0 ? score / maxBlockScore : 0 },
  });

  revalidatePath('/[locale]/(app)/progress', 'page');
  return { ok: true as const, correctCount, score };
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Снапшот для оценки достижений: всего попыток (любых), текущий стрик и
 * точность по темам. `exam` при желании добавляется вызывающим кодом.
 */
async function buildAchievementSnapshot(
  supabase: ServerClient,
  userId: string
): Promise<AchievementSnapshot> {
  const [attemptsRes, profileRes] = await Promise.all([
    supabase.from('attempts').select('is_correct, question_id').eq('user_id', userId),
    supabase.from('profiles').select('current_streak').eq('id', userId).maybeSingle(),
  ]);

  const attempts = (attemptsRes.data ?? []) as { is_correct: boolean; question_id: string }[];
  const currentStreak =
    (profileRes.data as { current_streak: number } | null)?.current_streak ?? 0;

  const topicStats: { attempts: number; correct: number }[] = [];
  const questionIds = Array.from(new Set(attempts.map((a) => a.question_id)));
  if (questionIds.length > 0) {
    const { data: questions } = await supabase
      .from('questions')
      .select('id, topic_id')
      .in('id', questionIds);
    const questionToTopic = new Map(
      ((questions ?? []) as { id: string; topic_id: string }[]).map((q) => [q.id, q.topic_id])
    );
    const byTopic = new Map<string, { attempts: number; correct: number }>();
    for (const a of attempts) {
      const topicId = questionToTopic.get(a.question_id);
      if (!topicId) continue;
      const stat = byTopic.get(topicId) ?? { attempts: 0, correct: 0 };
      stat.attempts++;
      if (a.is_correct) stat.correct++;
      byTopic.set(topicId, stat);
    }
    topicStats.push(...byTopic.values());
  }

  return { totalAttempts: attempts.length, currentStreak, topicStats };
}

/** Вставляет достижения, условие которых выполнено и которых ещё нет у пользователя. */
async function awardAchievements(
  supabase: ServerClient,
  userId: string,
  snapshot: AchievementSnapshot
): Promise<void> {
  const earned = evaluateAchievements(snapshot);
  if (earned.length === 0) return;

  const { data: existing } = await supabase
    .from('user_achievements')
    .select('achievement_key')
    .eq('user_id', userId);
  const have = new Set(
    ((existing ?? []) as { achievement_key: string }[]).map((r) => r.achievement_key)
  );

  const toInsert = earned.filter((key) => !have.has(key));
  if (toInsert.length === 0) return;

  await supabase
    .from('user_achievements')
    .insert(toInsert.map((achievement_key) => ({ user_id: userId, achievement_key })));
}
