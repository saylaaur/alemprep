// Типы данных AlemPrep.
//
// Раньше здесь была заглушка — поэтому проект не проходил `tsc`/`next build`
// (dev-сервер на SWC не проверяет типы, потому на localhost всё работало).
// Теперь это реальные типы, выведенные из схемы БД:
//   supabase/migrations/0001_initial_schema.sql
// Позже можно заменить автогенерацией:
//   npx supabase gen types typescript --project-id <id> > types/db.ts

export type Locale = 'ru' | 'kk';

export type QuestionType = 'single' | 'multi' | 'matching';
export type SessionMode = 'practice' | 'topic_drill' | 'mock_exam';

/** profiles — расширение auth.users */
export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  locale: Locale;
  daily_goal: number;
  current_streak: number;
  last_active_date: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

/** subjects — Математика / Физика / Информатика */
export type Subject = {
  id: string;
  slug: string;
  name_ru: string;
  name_kk: string;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

/** topics — темы внутри предмета */
export type Topic = {
  id: string;
  subject_id: string;
  slug: string;
  name_ru: string;
  name_kk: string;
  description_ru: string | null;
  description_kk: string | null;
  sort_order: number;
  created_at: string;
};

/** Блок контента (условие, разбор, контекст). value может содержать LaTeX в $…$ */
export type ContentBlock = {
  type?: 'text' | 'latex' | 'image';
  value: string;
};

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
  options: AnswerOption[];
  correct: string;
};

export type MultiBody = {
  stem: string;
  options: AnswerOption[];
  correct: string[];
};

export type MatchingBody = {
  stem: string;
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

/** Заглушка для типизации Supabase-клиента (можно заменить автогенерацией) */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
