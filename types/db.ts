// Типы данных AlemPrep.
//
// Раньше здесь была заглушка — поэтому проект не проходил `tsc`/`next build`
// (dev-сервер на SWC не проверяет типы, потому на localhost всё работало).
// Теперь это реальные типы, выведенные из схемы БД:
//   supabase/migrations/0001_initial_schema.sql
// Позже можно заменить автогенерацией:
//   npx supabase gen types typescript --project-id <id> > types/db.ts

import type { AssistantMode } from '@/lib/assistant';
import type { TeacherGroup, TeacherRoster } from '@/lib/teacher/contracts';

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
  question_ids: string[] | null;
  correct_count: number;
  score: number;
  started_at: string;
  finished_at: string | null;
  integrity_version: 0 | 1;
  operation_id: string | null;
  status: 'active' | 'submitted' | 'expired' | 'cancelled';
  expires_at: string | null;
  scoring_version: string | null;
  manifest_hash: string | null;
  receipt: unknown | null;
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
  session_item_id: string | null;
  integrity_version: 0 | 1;
  points: number | null;
  max_points: number | null;
};

/** question_versions — immutable server-side content revision. */
export type QuestionVersionRow = {
  id: string;
  question_id: string;
  family_id: string;
  revision: number;
  locale: Locale;
  type: QuestionType;
  public_body: unknown;
  grading_body: QuestionBody;
  explanation: Explanation | null;
  context_snapshot: ContextContent | null;
  content_hash: string;
  created_at: string;
};

export type QuestionPublication = {
  question_version_id: string;
  status: 'draft' | 'approved' | 'quarantined';
  math_review_ref: string | null;
  language_review_ref: string | null;
  source_rights_ref: string | null;
  updated_at: string;
};

export type SessionItem = {
  id: string;
  session_id: string;
  question_version_id: string;
  position: number;
  created_at: string;
};

export type OperationReceipt = {
  actor_id: string;
  operation_id: string;
  kind: 'learning.start' | 'learning.submit';
  payload_hash: string;
  result: unknown;
  created_at: string;
};

export type RewardLedgerEntry = {
  id: string;
  user_id: string;
  session_id: string;
  reward_key: string;
  amount: number;
  day: string;
  created_at: string;
};

export type AuditEvent = {
  id: string;
  actor_id: string | null;
  actor_kind: 'user' | 'operator' | 'system';
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  school_id: string | null;
  operation_id: string | null;
  occurred_at: string;
  metadata: unknown;
};

/** A scoped school participating in the supervised pilot. */
export type School = {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'archived';
  timezone: 'Asia/Almaty';
  created_at: string;
};

export type SchoolMembership = {
  id: string;
  school_id: string;
  user_id: string;
  role: 'student' | 'teacher' | 'coordinator';
  joined_at: string;
  ended_at: string | null;
};

export type SchoolGroup = {
  id: string;
  school_id: string;
  name: string;
  locale: Locale;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
};

export type GroupMembership = {
  id: string;
  school_id: string;
  group_id: string;
  school_membership_id: string;
  joined_at: string;
  ended_at: string | null;
};

export type GroupTeacher = {
  id: string;
  school_id: string;
  group_id: string;
  school_membership_id: string;
  assigned_at: string;
  ended_at: string | null;
};

/** The plaintext invite secret is deliberately absent from this DB shape. */
export type GroupInvite = {
  id: string;
  school_id: string;
  group_id: string;
  token_hash: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
  created_by_membership_id: string;
  created_at: string;
};

export type PilotOperationReceipt = {
  actor_id: string;
  operation_id: string;
  kind: 'pilot.invite' | 'pilot.join';
  payload_hash: string;
  result: unknown;
  created_at: string;
};

export type PilotProgram = {
  id: string;
  version: number;
  title_ru: string;
  title_kk: string | null;
  status: 'draft' | 'approved' | 'retired';
  review_ref: string | null;
  created_at: string;
};

export type PilotProgramItem = {
  id: string;
  program_id: string;
  position: number;
  question_version_id: string;
  locale: Locale;
  purpose: 'practice' | 'baseline' | 'endline';
  created_at: string;
};

export type PilotAssignment = {
  id: string;
  school_id: string;
  group_id: string;
  program_id: string;
  purpose: 'practice';
  comparison_baseline_id: string | null;
  opens_at: string;
  due_at: string;
  closes_at: string;
  created_by_membership_id: string;
  status: 'draft' | 'published' | 'cancelled';
  revision: number;
  created_at: string;
};

export type PilotAssignmentParticipant = {
  id: string;
  assignment_id: string;
  school_id: string;
  user_id: string;
  school_membership_id: string;
  eligible_from: string;
  withdrawn_at: string | null;
};

export type PilotAssignmentReceipt = {
  actor_id: string;
  operation_id: string;
  payload_hash: string;
  result: unknown;
  created_at: string;
};

/** Service-only idempotency receipt for an atomic school provisioning operation. */
export type PilotProvisionReceipt = {
  operator_id: string;
  operation_id: string;
  payload_hash: string;
  result: unknown;
  created_at: string;
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
    Functions: {
      content_source_snapshot_v1: { Args: { source_id: string }; Returns: unknown };
      content_topic_counts_v1: { Args: { content_locale: Locale }; Returns: { topic_id: string; type: QuestionType; question_count: number }[] };
      content_import_reviewed_v1: { Args: { batch_id: string; batch_hash: string; locale: 'ru'; entries: unknown }; Returns: unknown };
      content_accept_version_v1: { Args: { version_id: string; content_hash: string; math_review_ref: string; language_review_ref: string; source_rights_ref: string }; Returns: unknown };
      learning_active_session_access_v1: { Args: { actor_id: string; session_id: string }; Returns: boolean };
      pilot_session_has_accepted_completion_v1: { Args: { target_session: string }; Returns: boolean };
      /** 0036: Auth-scoped self-study report; does not grant table access. */
      pilot_teacher_dashboard_v1: {
        Args: { target_group_id?: string | null };
        Returns: { groups: TeacherGroup[] } | TeacherRoster | { error: 'unauthenticated' | 'not-found' };
      };
    };
    Enums: Record<string, never>;
  };
};
