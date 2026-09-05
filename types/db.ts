// Типы данных AlemPrep.
//
// Раньше здесь была заглушка — поэтому проект не проходил `tsc`/`next build`
// (dev-сервер на SWC не проверяет типы, потому на localhost всё работало).
// Теперь это реальные типы, выведенные из схемы БД:
//   supabase/migrations/0001_initial_schema.sql
// Позже можно заменить автогенерацией:
//   npx supabase gen types typescript --project-id <id> > types/db.ts

import type { AssistantMode } from '@/lib/assistant';

export type Locale = 'ru' | 'kk';

export type QuestionType = 'single' | 'multi' | 'matching';
export type SessionMode = 'practice' | 'topic_drill' | 'mock_exam' | 'diagnostic' | 'weekly';

/** Второй профильный предмет пары ЕНТ (первый всегда математика). */
export type SecondSubject = 'physics' | 'informatics';

/** profiles — расширение auth.users */
export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  locale: Locale;
  daily_goal: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  streak_freezes: number;
  last_freeze_used_date: string | null;
  xp: number;
  is_admin: boolean;
  second_subject: SecondSubject | null;
  exam_date: string | null;
  target_score: number | null;
  created_at: string;
  updated_at: string;
};

/** user_achievements — полученные бейджи (по одному ключу на пользователя) */
export type UserAchievement = {
  user_id: string;
  achievement_key: string;
  earned_at: string;
};

/** subjects — Математика / Физика / Информатика / Математическая грамотность */
export type Subject = {
  id: string;
  slug: string;
  name_ru: string;
  /** NULL, пока нет официального казахского перевода (см. 0019) — fallback на name_ru. */
  name_kk: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

/**
 * topics — темы внутри предмета. Двухуровневая структура (Раздел → Тема) по
 * официальным спецификациям НЦТ (см. 0019): section_no/section_name_ru/
 * section_name_kk/topic_no. Раздел хранится прямо на строке темы (без
 * отдельной таблицы sections), повторяясь по темам одного раздела.
 * У тем без официального раздела (старый контент вне спецификации) эти поля
 * NULL.
 */
export type Topic = {
  id: string;
  subject_id: string;
  slug: string;
  name_ru: string;
  /** NULL, пока нет официального казахского перевода (см. 0019) — fallback на name_ru. */
  name_kk: string | null;
  description_ru: string | null;
  description_kk: string | null;
  section_no: number | null;
  section_name_ru: string | null;
  section_name_kk: string | null;
  topic_no: number | null;
  sort_order: number;
  created_at: string;
};

/** Блок контента (условие, разбор, контекст). value может содержать LaTeX в $…$ */
export type ContentBlock =
  | { type?: 'text' | 'latex'; value: string }
  | { type: 'image'; value: string }
  | { type: 'table'; columns: string[]; rows: string[][] };

/** contexts.content (JSONB) */
export type ContextContent = {
  blocks: ContentBlock[];
};

/** contexts — общий текст для контекстных блоков */
export type Context = {
  id: string;
  topic_id: string | null;
  language: Locale;
  title: string | null;
  content: ContextContent;
  created_at: string;
};

/** Вариант ответа */
export type AnswerOption = {
  id: string;
  content: string;
};

/** questions.body (JSONB) — полиморфно по типу вопроса */
export type SingleBody = {
  stem: string;
  stem_blocks?: ContentBlock[];
  options: AnswerOption[];
  correct: string;
};

export type MultiBody = {
  stem: string;
  stem_blocks?: ContentBlock[];
  options: AnswerOption[];
  correct: string[];
};

export type MatchingBody = {
  stem: string;
  stem_blocks?: ContentBlock[];
  left: AnswerOption[];
  right: string[];
  correct: Record<string, string>;
};

export type QuestionBody = SingleBody | MultiBody | MatchingBody;

/** questions.explanation (JSONB) */
export type Explanation = {
  blocks: ContentBlock[];
};

/** questions — задачи */
export type Question = {
  id: string;
  topic_id: string;
  context_id: string | null;
  language: Locale;
  type: QuestionType;
  difficulty: number;
  body: QuestionBody;
  explanation: Explanation | null;
  source: string;
  is_published: boolean;
  sort_order: number;
  /** Оригинал, из которого сделан перевод (NULL для оригиналов). См. 0017. */
  source_question_id: string | null;
  created_at: string;
};

/** sessions — сессии практики и полного пробника */
export type Session = {
  id: string;
  user_id: string;
  topic_id: string | null;
  subject_id: string | null;
  mode: SessionMode;
  total_questions: number | null;
  correct_count: number;
  score: number;
  started_at: string;
  finished_at: string | null;
};

/** attempts — попытки пользователя */
export type Attempt = {
  id: string;
  user_id: string;
  question_id: string;
  session_id: string | null;
  given_answer: unknown;
  is_correct: boolean;
  time_spent_ms: number | null;
  attempted_at: string;
};

/** ai_usage — дневной счётчик запросов к ИИ-ассистенту (Слой 2), PK (user_id, usage_date) */
export type AiUsage = {
  user_id: string;
  usage_date: string;
  count: number;
};

/** ai_turns — история диалога с ИИ-ассистентом по (user_id, question_id) */
export type AiTurn = {
  id: string;
  user_id: string;
  question_id: string;
  role: 'student' | 'assistant';
  mode: AssistantMode | null;
  text: string;
  created_at: string;
};

/** ai_global_usage — суммарный дневной расход ИИ-ассистента по всем ученикам, PK usage_date (UTC) */
export type AiGlobalUsage = {
  usage_date: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
};

/** Заглушка для типизации Supabase-клиента (можно заменить автогенерацией) */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
