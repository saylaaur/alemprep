import { createClient } from './server';
import {
  EXAM_BLUEPRINT,
  EXAM_FIRST_SUBJECT,
  pickBalancedByTopic,
  type ExamSecondSubject,
  type ExamShortfall,
} from '@/lib/exam';
import { localDateStr } from '@/lib/streak';
import {
  levelProgress,
  upcomingBadges,
  ACHIEVEMENT_KEYS,
  TOPIC_MASTERY_MIN_ATTEMPTS,
  TOPIC_MASTERY_RATIO,
  type AchievementKey,
  type UpcomingBadge,
} from '@/lib/gamification';
import { DIAGNOSTIC_PAIR_MAX_SCORE } from '@/lib/exam';
import { WEEKLY_PAIR_MAX_SCORE, isSameIsoWeek, nextIsoWeekMonday } from '@/lib/weekly';
import { buildTrajectory, type TrajectoryPoint, type TrajectorySessionMode } from '@/lib/progress';
import type { BaselineTopicStat } from '@/lib/plan';
import type { QuestionType } from '@/types/db';
import type { Profile, Subject, Topic, Locale, Question, ContextContent } from '@/types/db';

// ---- Admin helpers ----

export type UnpublishedQuestion = Question & {
  topic_name_ru: string;
  topic_name_kk: string;
  subject_slug: string;
};

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  return (data as { is_admin: boolean } | null)?.is_admin === true;
}

export async function getUnpublishedQuestions(): Promise<UnpublishedQuestion[]> {
  const supabase = await createClient();

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('is_published', false)
    .order('created_at', { ascending: false });

  if (!questions || questions.length === 0) return [];

  const topicIds = Array.from(
    new Set((questions as Question[]).map((q) => q.topic_id)),
  );

  const { data: topics } = await supabase
    .from('topics')
    .select('id, name_ru, name_kk, subject_id')
    .in('id', topicIds);

  const subjectIds = Array.from(
    new Set(
      (topics ?? []).map(
        (t: { subject_id: string }) => t.subject_id,
      ),
    ),
  );

  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, slug')
    .in('id', subjectIds);

  const subjectMap = new Map<string, string>(
    (subjects ?? []).map((s: { id: string; slug: string }) => [s.id, s.slug]),
  );
  const topicMap = new Map<
    string,
    { id: string; name_ru: string; name_kk: string; subject_id: string }
  >(
    (topics ?? []).map(
      (t: { id: string; name_ru: string; name_kk: string; subject_id: string }) => [t.id, t],
    ),
  );

  return (questions as Question[]).map((q) => {
    const topic = topicMap.get(q.topic_id);
    return {
      ...q,
      topic_name_ru: topic?.name_ru ?? '—',
      topic_name_kk: topic?.name_kk ?? '—',
      subject_slug: topic ? (subjectMap.get(topic.subject_id) ?? '') : '',
    };
  });
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    return data as Profile | null;
  } catch {
    return null;
  }
}

export async function getSubjectsWithCounts() {
  const supabase = await createClient();
  // RPC или ручной join? Делаем 2 запроса для простоты.
  const [subjectsRes, topicsRes, questionsRes] = await Promise.all([
    supabase.from('subjects').select('*').order('sort_order').then((r) => r, () => ({ data: [] })),
    supabase.from('topics').select('id, subject_id').then((r) => r, () => ({ data: [] })),
    supabase.from('questions').select('id, topic_id').eq('is_published', true).then((r) => r, () => ({ data: [] })),
  ]);

  const subjects = (subjectsRes.data ?? []) as Subject[];
  const topics = (topicsRes.data ?? []) as { id: string; subject_id: string }[];
  const questions = (questionsRes.data ?? []) as { id: string; topic_id: string }[];

  const topicsBySubject = new Map<string, number>();
  const topicToSubject = new Map<string, string>();
  for (const t of topics) {
    topicsBySubject.set(t.subject_id, (topicsBySubject.get(t.subject_id) ?? 0) + 1);
    topicToSubject.set(t.id, t.subject_id);
  }

  const questionsBySubject = new Map<string, number>();
  for (const q of questions) {
    const sid = topicToSubject.get(q.topic_id);
    if (!sid) continue;
    questionsBySubject.set(sid, (questionsBySubject.get(sid) ?? 0) + 1);
  }

  return subjects.map((s) => ({
    ...s,
    topic_count: topicsBySubject.get(s.id) ?? 0,
    question_count: questionsBySubject.get(s.id) ?? 0,
  }));
}

export async function getSubjectBySlug(slug: string): Promise<Subject | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subjects')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return data as Subject | null;
}

export async function getTopicsForSubject(subjectSlug: string) {
  const supabase = await createClient();
  const subject = await getSubjectBySlug(subjectSlug);
  if (!subject) return [];

  const [topicsRes, questionsRes] = await Promise.all([
    supabase
      .from('topics')
      .select('*')
      .eq('subject_id', subject.id)
      .order('sort_order'),
    supabase.from('questions').select('id, topic_id').eq('is_published', true),
  ]);

  const topics = (topicsRes.data ?? []) as Topic[];
  const questions = (questionsRes.data ?? []) as { id: string; topic_id: string }[];

  const counts = new Map<string, number>();
  for (const q of questions) {
    counts.set(q.topic_id, (counts.get(q.topic_id) ?? 0) + 1);
  }

  return topics.map((t) => ({
    ...t,
    question_count: counts.get(t.id) ?? 0,
  }));
}

export async function getTodayAttemptsCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('attempted_at', start.toISOString());

  return count ?? 0;
}

export function displayName(profile: Profile | null): string | null {
  if (!profile?.full_name) return null;
  // Берём только имя (первое слово)
  return profile.full_name.split(' ')[0];
}

export function subjectName(subject: Pick<Subject, 'name_ru' | 'name_kk'>, locale: Locale): string {
  return locale === 'kk' ? subject.name_kk : subject.name_ru;
}

export function topicName(topic: Pick<Topic, 'name_ru' | 'name_kk'>, locale: Locale): string {
  return locale === 'kk' ? topic.name_kk : topic.name_ru;
}

// ---- Progress data ----

export type DailyActivity = { date: string; count: number };

export type TopicStat = {
  topic_id: string;
  topic_name_ru: string;
  topic_name_kk: string;
  total: number;
  correct: number;
};

export type RecentAttemptItem = {
  id: string;
  is_correct: boolean;
  attempted_at: string;
  topic_name_ru: string;
  topic_name_kk: string;
};

export type ProgressData = {
  currentStreak: number;
  totalAttempts: number;
  correctAttempts: number;
  dailyActivity: DailyActivity[];
  topicStats: TopicStat[];
  recentAttempts: RecentAttemptItem[];
};

export async function getProgressData(): Promise<ProgressData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [attemptsRes, profileRes, topicsRes] = await Promise.all([
    supabase
      .from('attempts')
      .select('id, is_correct, attempted_at, question_id')
      .eq('user_id', user.id)
      .order('attempted_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('current_streak')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('topics').select('id, name_ru, name_kk'),
  ]);

  const currentStreak =
    (profileRes.data as { current_streak: number } | null)?.current_streak ?? 0;

  const allAttempts = (attemptsRes.data ?? []) as {
    id: string;
    is_correct: boolean;
    attempted_at: string;
    question_id: string;
  }[];

  if (allAttempts.length === 0) {
    return {
      currentStreak,
      totalAttempts: 0,
      correctAttempts: 0,
      dailyActivity: [],
      topicStats: [],
      recentAttempts: [],
    };
  }

  const questionIds = Array.from(new Set(allAttempts.map((a) => a.question_id)));
  const { data: questionsRaw } = await supabase
    .from('questions')
    .select('id, topic_id')
    .in('id', questionIds);

  const questionToTopic = new Map<string, string>();
  for (const q of (questionsRaw ?? []) as { id: string; topic_id: string }[]) {
    questionToTopic.set(q.id, q.topic_id);
  }

  const topicMap = new Map<string, { id: string; name_ru: string; name_kk: string }>();
  for (const topic of (topicsRes.data ?? []) as {
    id: string;
    name_ru: string;
    name_kk: string;
  }[]) {
    topicMap.set(topic.id, topic);
  }

  // Daily activity for the last 84 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 83);
  cutoff.setHours(0, 0, 0, 0);
  const activityMap = new Map<string, number>();
  for (const a of allAttempts) {
    const d = new Date(a.attempted_at);
    if (d >= cutoff) {
      // локальная дата — как в heatmap и подсчёте «сегодня» (не UTC)
      const key = localDateStr(d);
      activityMap.set(key, (activityMap.get(key) ?? 0) + 1);
    }
  }
  const dailyActivity: DailyActivity[] = Array.from(activityMap.entries()).map(
    ([date, count]) => ({ date, count })
  );

  // Topic accuracy (all time), sorted weakest → strongest
  const topicStatsMap = new Map<string, TopicStat>();
  for (const a of allAttempts) {
    const topicId = questionToTopic.get(a.question_id);
    if (!topicId) continue;
    const topic = topicMap.get(topicId);
    if (!topic) continue;
    if (!topicStatsMap.has(topicId)) {
      topicStatsMap.set(topicId, {
        topic_id: topicId,
        topic_name_ru: topic.name_ru,
        topic_name_kk: topic.name_kk,
        total: 0,
        correct: 0,
      });
    }
    const stat = topicStatsMap.get(topicId)!;
    stat.total++;
    if (a.is_correct) stat.correct++;
  }
  const topicStats: TopicStat[] = Array.from(topicStatsMap.values()).sort(
    (a, b) => a.correct / a.total - b.correct / b.total
  );

  // Most recent 10 attempts with topic names
  const recentAttempts: RecentAttemptItem[] = allAttempts.slice(0, 10).map((a) => {
    const topicId = questionToTopic.get(a.question_id);
    const topic = topicId ? topicMap.get(topicId) : undefined;
    return {
      id: a.id,
      is_correct: a.is_correct,
      attempted_at: a.attempted_at,
      topic_name_ru: topic?.name_ru ?? '—',
      topic_name_kk: topic?.name_kk ?? '—',
    };
  });

  return {
    currentStreak,
    totalAttempts: allAttempts.length,
    correctAttempts: allAttempts.filter((a) => a.is_correct).length,
    dailyActivity,
    topicStats,
    recentAttempts,
  };
}

// ---- Gamification ----

export type GamificationBadge = { key: AchievementKey; earnedAt: string };

export type TopicMasteryStat = {
  topicId: string;
  subjectId: string;
  nameRu: string;
  nameKk: string;
  total: number;
  correct: number;
  accuracy: number;
  mastered: boolean;
};

export type Gamification = {
  xp: number;
  level: number;
  xpIntoLevel: number;
  levelSpan: number;
  xpToNext: number;
  percentToNext: number;
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  /** true, если последняя заморозка спасла серию именно на текущий last_active_date. */
  freezeJustSaved: boolean;
  solvedToday: number;
  earned: GamificationBadge[];
  upcoming: UpcomingBadge[];
  topicMastery: TopicMasteryStat[];
};

/**
 * Полная сводка геймификации для UI: уровень и прогресс по XP, стрик и его рекорд,
 * решено сегодня, полученные и ближайшие бейджи, мастерство по темам. Считается на сервере.
 */
export async function getGamification(userId: string): Promise<Gamification | null> {
  const supabase = await createClient();

  const [profileRes, attemptsRes, achievementsRes, topicsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('xp, current_streak, longest_streak, streak_freezes, last_active_date, last_freeze_used_date')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('is_correct, question_id, attempted_at')
      .eq('user_id', userId),
    supabase
      .from('user_achievements')
      .select('achievement_key, earned_at')
      .eq('user_id', userId),
    supabase.from('topics').select('id, name_ru, name_kk, subject_id'),
  ]);

  const profile = profileRes.data as {
    xp: number;
    current_streak: number;
    longest_streak: number;
    streak_freezes: number;
    last_active_date: string | null;
    last_freeze_used_date: string | null;
  } | null;
  if (!profile) return null;

  const xp = profile.xp ?? 0;
  const currentStreak = profile.current_streak ?? 0;
  const streakFreezes = profile.streak_freezes ?? 0;
  const freezeJustSaved =
    profile.last_freeze_used_date != null && profile.last_freeze_used_date === profile.last_active_date;
  const progress = levelProgress(xp);

  const attempts = (attemptsRes.data ?? []) as {
    is_correct: boolean;
    question_id: string;
    attempted_at: string;
  }[];

  // Решено сегодня — локальная дата, тот же базис, что у getTodayAttemptsCount.
  const today = localDateStr();
  const solvedToday = attempts.filter(
    (a) => localDateStr(new Date(a.attempted_at)) === today
  ).length;

  // Мастерство по темам: точность по каждой теме.
  const topicMap = new Map<
    string,
    { name_ru: string; name_kk: string; subject_id: string }
  >();
  for (const t of (topicsRes.data ?? []) as {
    id: string;
    name_ru: string;
    name_kk: string;
    subject_id: string;
  }[]) {
    topicMap.set(t.id, t);
  }

  const questionIds = Array.from(new Set(attempts.map((a) => a.question_id)));
  const questionToTopic = new Map<string, string>();
  if (questionIds.length > 0) {
    const { data: questions } = await supabase
      .from('questions')
      .select('id, topic_id')
      .in('id', questionIds);
    for (const q of (questions ?? []) as { id: string; topic_id: string }[]) {
      questionToTopic.set(q.id, q.topic_id);
    }
  }

  const byTopic = new Map<string, { total: number; correct: number }>();
  for (const a of attempts) {
    const topicId = questionToTopic.get(a.question_id);
    if (!topicId) continue;
    const stat = byTopic.get(topicId) ?? { total: 0, correct: 0 };
    stat.total++;
    if (a.is_correct) stat.correct++;
    byTopic.set(topicId, stat);
  }

  const topicMastery: TopicMasteryStat[] = Array.from(byTopic.entries())
    .map(([topicId, stat]) => {
      const topic = topicMap.get(topicId);
      const accuracy = stat.correct / stat.total;
      return {
        topicId,
        subjectId: topic?.subject_id ?? '',
        nameRu: topic?.name_ru ?? '—',
        nameKk: topic?.name_kk ?? '—',
        total: stat.total,
        correct: stat.correct,
        accuracy,
        mastered: stat.total >= TOPIC_MASTERY_MIN_ATTEMPTS && accuracy > TOPIC_MASTERY_RATIO,
      };
    })
    .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);

  // Полученные бейджи — в порядке справочника.
  const earnedAtByKey = new Map<string, string>();
  for (const row of (achievementsRes.data ?? []) as {
    achievement_key: string;
    earned_at: string;
  }[]) {
    earnedAtByKey.set(row.achievement_key, row.earned_at);
  }
  const earned: GamificationBadge[] = ACHIEVEMENT_KEYS.filter((k) =>
    earnedAtByKey.has(k)
  ).map((key) => ({ key, earnedAt: earnedAtByKey.get(key)! }));

  const upcoming = upcomingBadges(
    { totalAttempts: attempts.length, currentStreak },
    earned.map((b) => b.key)
  );

  return {
    xp,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    levelSpan: progress.levelSpan,
    xpToNext: progress.xpToNext,
    percentToNext: progress.percentToNext,
    currentStreak,
    longestStreak: profile.longest_streak ?? 0,
    streakFreezes,
    freezeJustSaved,
    solvedToday,
    earned,
    upcoming,
    topicMastery,
  };
}

export type MockExamTopic = { id: string; name_ru: string; name_kk: string };

// ---- Пробник: пара профильных предметов ----

export type ExamContext = { id: string; title: string | null; content: ContextContent };

export type ExamAvailability = Record<string, Partial<Record<QuestionType, number>>>;

/** Сколько опубликованных задач каждого типа есть у каждого предмета (для предупреждений на интро). */
export async function getExamAvailability(locale: Locale = 'ru'): Promise<ExamAvailability> {
  const supabase = await createClient();
  const [subjectsRes, topicsRes, questionsRes] = await Promise.all([
    supabase.from('subjects').select('id, slug'),
    supabase.from('topics').select('id, subject_id'),
    supabase
      .from('questions')
      .select('type, topic_id')
      .eq('language', locale)
      .eq('is_published', true),
  ]);

  const subjectSlugById = new Map(
    ((subjectsRes.data ?? []) as { id: string; slug: string }[]).map((s) => [s.id, s.slug])
  );
  const topicToSubject = new Map(
    ((topicsRes.data ?? []) as { id: string; subject_id: string }[]).map((t) => [
      t.id,
      t.subject_id,
    ])
  );

  const availability: ExamAvailability = {};
  for (const q of (questionsRes.data ?? []) as { type: QuestionType; topic_id: string }[]) {
    const subjectId = topicToSubject.get(q.topic_id);
    const slug = subjectId ? subjectSlugById.get(subjectId) : undefined;
    if (!slug) continue;
    const bySlug = (availability[slug] ??= {});
    bySlug[q.type] = (bySlug[q.type] ?? 0) + 1;
  }
  return availability;
}

export type ExamBlock = {
  subjectSlug: string;
  subjectId: string;
  name_ru: string;
  name_kk: string;
  topics: MockExamTopic[];
  questions: Question[];
  shortfall: ExamShortfall[];
};

/**
 * Собирает два блока пробника (математика + второй предмет):
 * опубликованные задачи локали, сбалансированный по темам отбор по блюпринту.
 * Если задач не хватает — блок короче + shortfall.
 *
 * `pick` — точка расширения отбора (по умолчанию pickBalancedByTopic): еженедельный
 * тест передаёт обёртку с предпочтением свежих вопросов (pickFreshBalancedByTopic,
 * lib/weekly.ts) — сама функция ничего не знает о «свежести», просто вызывает pick.
 */
export async function getPairExamBlocks(
  second: ExamSecondSubject,
  locale: Locale = 'ru',
  blueprint: typeof EXAM_BLUEPRINT = EXAM_BLUEPRINT,
  pick: (
    pool: Question[],
    blueprint: typeof EXAM_BLUEPRINT
  ) => { picked: Question[]; shortfall: ExamShortfall[] } = pickBalancedByTopic
): Promise<{ blocks: ExamBlock[]; contexts: Map<string, ExamContext> } | null> {
  const supabase = await createClient();
  const slugs = [EXAM_FIRST_SUBJECT, second];

  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, slug, name_ru, name_kk')
    .in('slug', slugs);

  const subjectRows = (subjects ?? []) as {
    id: string;
    slug: string;
    name_ru: string;
    name_kk: string;
  }[];
  if (subjectRows.length !== slugs.length) return null;

  const { data: topics } = await supabase
    .from('topics')
    .select('id, name_ru, name_kk, subject_id')
    .in('subject_id', subjectRows.map((s) => s.id));

  const topicRows = (topics ?? []) as (MockExamTopic & { subject_id: string })[];

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('topic_id', topicRows.map((t) => t.id))
    .eq('language', locale)
    .eq('is_published', true);

  const pool = (questions ?? []) as Question[];
  const topicSubject = new Map(topicRows.map((t) => [t.id, t.subject_id]));

  // порядок блоков фиксирован: математика первой
  const blocks: ExamBlock[] = slugs.map((slug) => {
    const subject = subjectRows.find((s) => s.slug === slug)!;
    const subjectPool = pool.filter((q) => topicSubject.get(q.topic_id) === subject.id);
    const { picked, shortfall } = pick(subjectPool, blueprint);
    return {
      subjectSlug: subject.slug,
      subjectId: subject.id,
      name_ru: subject.name_ru,
      name_kk: subject.name_kk,
      topics: topicRows
        .filter((t) => t.subject_id === subject.id)
        .map(({ id, name_ru, name_kk }) => ({ id, name_ru, name_kk })),
      questions: picked,
      shortfall,
    };
  });

  const contextIds = Array.from(
    new Set(
      blocks
        .flatMap((b) => b.questions)
        .map((q) => q.context_id)
        .filter((x): x is string => Boolean(x))
    )
  );
  const contextsMap = new Map<string, ExamContext>();
  if (contextIds.length > 0) {
    const { data: contexts } = await supabase
      .from('contexts')
      .select('id, title, content')
      .in('id', contextIds);
    (contexts ?? []).forEach((c) =>
      contextsMap.set(c.id, {
        id: c.id,
        title: c.title as string | null,
        content: c.content as ContextContent,
      })
    );
  }

  return { blocks, contexts: contextsMap };
}

export async function getQuestionsForTopic(topicSlug: string, locale: Locale = 'ru') {
  const supabase = await createClient();
  const { data: topic } = await supabase
    .from('topics')
    .select('id, name_ru, name_kk, slug')
    .eq('slug', topicSlug)
    .maybeSingle();
  if (!topic) return { topic: null, questions: [] as Question[], contexts: new Map<string, { id: string; title: string | null; content: ContextContent }>() };

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('topic_id', topic.id)
    .eq('language', locale)
    .eq('is_published', true)
    .order('sort_order');

  const list = (questions ?? []) as Question[];

  const contextIds = Array.from(
    new Set(list.map((q) => q.context_id).filter((x): x is string => Boolean(x)))
  );

  const contextsMap = new Map<string, { id: string; title: string | null; content: ContextContent }>();
  if (contextIds.length > 0) {
    const { data: contexts } = await supabase
      .from('contexts')
      .select('id, title, content')
      .in('id', contextIds);
    (contexts ?? []).forEach((c) =>
      contextsMap.set(c.id, { id: c.id, title: c.title as string | null, content: c.content as ContextContent })
    );
  }

  return { topic, questions: list, contexts: contextsMap };
}

// ---- Персональный план (baseline из диагностики) ----

export type DiagnosticBaseline = {
  sessionId: string;
  finishedAt: string;
  score: number;
  maxScore: number;
  topicStats: BaselineTopicStat[];
};

/**
 * Baseline — самая РАННЯЯ завершённая diagnostic-сессия пользователя (v1 без
 * ретейка: она же единственная). Разрез по темам строится из attempts этой
 * сессии (сессия одна на всю диагностику, subject_id NULL).
 */
export async function getDiagnosticBaseline(userId: string): Promise<DiagnosticBaseline | null> {
  const supabase = await createClient();

  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('id, score, finished_at')
    .eq('user_id', userId)
    .eq('mode', 'diagnostic')
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: true })
    .limit(1);

  const session = (sessionRows ?? [])[0] as { id: string; score: number; finished_at: string } | undefined;
  if (!session) return null;

  const { data: attemptRows } = await supabase
    .from('attempts')
    .select('question_id, is_correct')
    .eq('session_id', session.id);

  const attempts = (attemptRows ?? []) as { question_id: string; is_correct: boolean }[];
  const questionIds = Array.from(new Set(attempts.map((a) => a.question_id)));

  const topicStats: BaselineTopicStat[] = [];
  if (questionIds.length > 0) {
    const { data: questionsRaw } = await supabase
      .from('questions')
      .select('id, topic_id')
      .in('id', questionIds);
    const questionToTopic = new Map(
      ((questionsRaw ?? []) as { id: string; topic_id: string }[]).map((q) => [q.id, q.topic_id])
    );

    const topicIds = Array.from(new Set(Array.from(questionToTopic.values())));
    const { data: topicsRaw } = topicIds.length > 0
      ? await supabase.from('topics').select('id, name_ru, name_kk').in('id', topicIds)
      : { data: [] };
    const topicMap = new Map(
      ((topicsRaw ?? []) as { id: string; name_ru: string; name_kk: string }[]).map((t) => [t.id, t])
    );

    const byTopic = new Map<string, { total: number; correct: number }>();
    for (const a of attempts) {
      const topicId = questionToTopic.get(a.question_id);
      if (!topicId) continue;
      const stat = byTopic.get(topicId) ?? { total: 0, correct: 0 };
      stat.total++;
      if (a.is_correct) stat.correct++;
      byTopic.set(topicId, stat);
    }
    for (const [topicId, stat] of byTopic) {
      const topic = topicMap.get(topicId);
      if (!topic) continue;
      topicStats.push({ topicId, nameRu: topic.name_ru, nameKk: topic.name_kk, ...stat });
    }
  }

  return {
    sessionId: session.id,
    finishedAt: session.finished_at,
    score: session.score ?? 0,
    maxScore: DIAGNOSTIC_PAIR_MAX_SCORE,
    topicStats,
  };
}

export type WeeklyTestSummary = {
  /** false, если за текущую ISO-неделю уже есть weekly-сессия (в любом статусе). */
  availableThisWeek: boolean;
  /** ISO-строка начала следующей доступной недели (понедельник). */
  nextAvailableAt: string;
  lastScore: number | null;
  previousScore: number | null;
  /** lastScore - previousScore, или null, если завершённых тестов меньше двух. */
  delta: number | null;
  maxScore: number;
};

/**
 * Сводка для карточки на дашборде и интро-экрана /weekly: доступен ли новый
 * тест на этой ISO-неделе, и балл/дельта по последним завершённым. «Уже была
 * сессия на этой неделе» считаем по ЛЮБОЙ (не только завершённой) weekly-сессии —
 * та же логика, что в startWeeklyTest, чтобы интро не обещало то, чего старт
 * не позволит.
 */
export async function getWeeklyTestSummary(userId: string): Promise<WeeklyTestSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('sessions')
    .select('score, started_at, finished_at')
    .eq('user_id', userId)
    .eq('mode', 'weekly');

  const sessions = (data ?? []) as {
    score: number | null;
    started_at: string;
    finished_at: string | null;
  }[];

  const now = new Date();
  const availableThisWeek = !sessions.some((s) => isSameIsoWeek(new Date(s.started_at), now));

  const finished = sessions
    .filter((s) => s.finished_at != null)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  const lastScore = finished[0]?.score ?? null;
  const previousScore = finished[1]?.score ?? null;
  const delta = lastScore !== null && previousScore !== null ? lastScore - previousScore : null;

  return {
    availableThisWeek,
    nextAvailableAt: nextIsoWeekMonday(now).toISOString(),
    lastScore,
    previousScore,
    delta,
    maxScore: WEEKLY_PAIR_MAX_SCORE,
  };
}

/**
 * Точки для графика траектории на /progress: завершённые diagnostic + weekly
 * сессии, по возрастанию даты. [] если данных ещё нет. Как и getWeeklyTestSummary —
 * фильтруем только eq (без .in/.order), сортировка/срез на стороне JS.
 */
export async function getProgressTrajectory(userId: string): Promise<TrajectoryPoint[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('sessions')
    .select('mode, score, finished_at')
    .eq('user_id', userId);

  const sessions = (data ?? []) as { mode: string; score: number | null; finished_at: string | null }[];
  const relevant = sessions
    .filter((s): s is { mode: TrajectorySessionMode; score: number | null; finished_at: string | null } =>
      s.mode === 'diagnostic' || s.mode === 'weekly'
    )
    .map((s) => ({ mode: s.mode, score: s.score, finishedAt: s.finished_at }));

  return buildTrajectory(relevant);
}
