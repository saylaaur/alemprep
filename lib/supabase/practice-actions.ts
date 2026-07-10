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
  const { data: insertedAttempt, error: insertError } = await supabase
    .from('attempts')
    .insert({
      user_id: user.id,
      question_id: input.questionId,
      given_answer: input.givenAnswer,
      is_correct: input.isCorrect,
      time_spent_ms: input.timeSpentMs,
    })
    .select('id')
    .single();
  if (insertError) {
    return { ok: false as const, error: insertError.message };
  }
  const attemptId = (insertedAttempt as { id: string } | null)?.id;

  // 2. Обновляем стрик, рекорд стрика и XP. Локальная дата — тот же базис,
  // что у getTodayAttemptsCount; toISOString здесь давал бы UTC-сдвиг.
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_streak, last_active_date, longest_streak, xp')
    .eq('id', user.id)
    .maybeSingle();

  let xpAwarded = 0;
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
      xpAwarded = XP_PER_CORRECT;
    }
    if (Object.keys(update).length > 0) {
      const { error: profileError } = await supabase.from('profiles').update(update).eq('id', user.id);
      if (profileError) {
        if (attemptId) {
          await supabase.from('attempts').delete().eq('id', attemptId).eq('user_id', user.id);
        }
        return { ok: false as const, error: profileError.message };
      }
    }
  }

  // 3. Достижения (контекст практики — без exam)
  await awardAchievements(supabase, user.id, await buildAchievementSnapshot(supabase, user.id));

  // Дашборд/прогресс должны пересчитать XP, уровень и стрик при следующем заходе
  revalidatePath('/[locale]/(app)/dashboard', 'page');
  revalidatePath('/[locale]/(app)/progress', 'page');

  // xpAwarded — реально начисленный XP: клиент показывает микро-празднование «+N XP»
  return { ok: true as const, xpAwarded };
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

  // Условный UPDATE (finished_at IS NULL) закрывает более узкое TOCTOU-окно
  // между проверкой prior.finished_at выше и этой записью: если два запроса
  // на одну и ту же сессию (двойной клик, ретрай сети) проскочили проверку
  // одновременно, .select() после update вернёт затронутые строки только
  // победителю гонки — проигравший увидит пустой результат и не продублирует
  // XP/бонус/достижения.
  const { data: updatedRows, error: sessionError } = await supabase
    .from('sessions')
    .update({ correct_count: correctCount, score, finished_at: new Date().toISOString() })
    .eq('id', input.sessionId)
    .eq('user_id', user.id)
    .is('finished_at', null)
    .select('correct_count, score');

  if (sessionError) return { error: sessionError.message };

  if (!updatedRows || updatedRows.length === 0) {
    // Существование сессии уже подтверждено выше — значит, кто-то другой
    // выиграл гонку и завершил её между нашей проверкой и этим update.
    // Возвращаем то, что сохранил победитель, без повторных побочных эффектов.
    const { data: raceWinner } = await supabase
      .from('sessions')
      .select('correct_count, score')
      .eq('id', input.sessionId)
      .eq('user_id', user.id)
      .maybeSingle();
    const winner = raceWinner as { correct_count: number | null; score: number | null } | null;
    return { ok: true as const, correctCount: winner?.correct_count ?? 0, score: winner?.score ?? 0 };
  }

  // В attempts пишем только отвеченные вопросы: given_answer в схеме NOT NULL,
  // а неотвеченные приходят с givenAnswer: null. Балл и correctCount выше
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
        .update({
          correct_count: prior.correct_count,
          score: prior.score,
          finished_at: prior.finished_at,
        })
        .eq('id', input.sessionId)
        .eq('user_id', user.id);
      return { error: attemptsError.message };
    }
  }

  // XP за пробник: +10 за верный ответ + разовый бонус за завершённый блок.
  // Пробник не проходит через recordAttempt, поэтому XP и стрик обновляем здесь.
  const { data: examProfile } = await supabase
    .from('profiles')
    .select('xp, current_streak, last_active_date, longest_streak')
    .eq('id', user.id)
    .maybeSingle();
  const profile = examProfile as {
    xp: number | null;
    current_streak: number | null;
    last_active_date: string | null;
    longest_streak: number | null;
  } | null;
  const xpGain = correctCount * XP_PER_CORRECT + EXAM_BLOCK_BONUS;
  const profileUpdate: Record<string, unknown> = {
    xp: (profile?.xp ?? 0) + xpGain,
  };
  if (profile) {
    const nextStreak = advanceStreak({
      lastActiveDate: profile.last_active_date,
      currentStreak: profile.current_streak ?? 0,
      today: localDateStr(),
    });
    if (nextStreak) {
      profileUpdate.current_streak = nextStreak.streak;
      profileUpdate.last_active_date = nextStreak.lastActiveDate;
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
