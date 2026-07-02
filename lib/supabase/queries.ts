import { createClient } from './server';
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

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
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

export async function getSubjects(): Promise<Subject[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subjects')
    .select('*')
    .order('sort_order');
  return (data as Subject[] | null) ?? [];
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

export function displayName(profile: Profile | null, locale: Locale): string {
  if (!profile?.full_name) return locale === 'kk' ? 'оқушы' : 'студент';
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
      const key = d.toISOString().split('T')[0];
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
