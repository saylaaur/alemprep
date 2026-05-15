import { createClient } from './server';
import type { Profile, Subject, Topic, Locale } from '@/types/db';

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

export async function getQuestionsForTopic(topicSlug: string, locale: Locale = 'ru') {
  const supabase = await createClient();
  const { data: topic } = await supabase
    .from('topics')
    .select('id, name_ru, name_kk, slug')
    .eq('slug', topicSlug)
    .maybeSingle();
  if (!topic) return { topic: null, questions: [] as never[], contexts: new Map() };

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('topic_id', topic.id)
    .eq('language', locale)
    .eq('is_published', true)
    .order('sort_order');

  const list = (questions ?? []) as Array<{
    id: string;
    topic_id: string;
    context_id: string | null;
    language: Locale;
    type: 'single' | 'multi' | 'matching';
    body: unknown;
    explanation: unknown;
    sort_order: number;
  }>;

  const contextIds = Array.from(
    new Set(list.map((q) => q.context_id).filter((x): x is string => Boolean(x)))
  );

  const contextsMap = new Map<string, { id: string; title: string | null; content: unknown }>();
  if (contextIds.length > 0) {
    const { data: contexts } = await supabase
      .from('contexts')
      .select('id, title, content')
      .in('id', contextIds);
    (contexts ?? []).forEach((c) => contextsMap.set(c.id, c));
  }

  return { topic, questions: list, contexts: contextsMap };
}
