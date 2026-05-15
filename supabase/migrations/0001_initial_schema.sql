-- =====================================================
-- AlemPrep: Initial schema
-- =====================================================
-- Tables:
--   profiles        — расширение auth.users (имя, аватарка, стрик)
--   subjects        — Математика / Физика / Информатика
--   topics          — Логарифмы / Стереометрия / ... (привязаны к subject)
--   contexts        — общий текст для контекстных блоков (картина + 5 подзадач)
--   questions       — задачи; type = single|multi|matching; body в JSONB
--   sessions        — сессии практики (для будущего «Полного пробника»)
--   attempts        — попытки пользователя (что выбрал, правильно ли, время)
--
-- Все таблицы под RLS. Контент (subjects/topics/questions) читают
-- все залогиненные. Personal (profiles/attempts/sessions) — только свой.
-- =====================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. profiles
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'kk')),
  daily_goal INT NOT NULL DEFAULT 20,
  current_streak INT NOT NULL DEFAULT 0,
  last_active_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. subjects
-- =====================================================
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name_ru TEXT NOT NULL,
  name_kk TEXT NOT NULL,
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 3. topics
-- =====================================================
CREATE TABLE IF NOT EXISTS public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  name_kk TEXT NOT NULL,
  description_ru TEXT,
  description_kk TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_id, slug)
);

CREATE INDEX IF NOT EXISTS topics_subject_idx ON public.topics(subject_id, sort_order);

-- =====================================================
-- 4. contexts (общий текст/картинка для контекстных блоков)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'kk')),
  title TEXT,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 5. questions
-- =====================================================
DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('single', 'multi', 'matching');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  context_id UUID REFERENCES public.contexts(id) ON DELETE SET NULL,
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'kk')),
  type question_type NOT NULL,
  difficulty INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  body JSONB NOT NULL,
  explanation JSONB,
  source TEXT NOT NULL DEFAULT 'ai_rewritten',
  is_published BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questions_topic_idx ON public.questions(topic_id, is_published, sort_order);
CREATE INDEX IF NOT EXISTS questions_language_idx ON public.questions(language);

-- =====================================================
-- 6. sessions (для режима практики и полного пробника)
-- =====================================================
DO $$ BEGIN
  CREATE TYPE session_mode AS ENUM ('practice', 'topic_drill', 'mock_exam');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  mode session_mode NOT NULL,
  total_questions INT,
  correct_count INT NOT NULL DEFAULT 0,
  score INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON public.sessions(user_id, started_at DESC);

-- =====================================================
-- 7. attempts
-- =====================================================
CREATE TABLE IF NOT EXISTS public.attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  given_answer JSONB NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent_ms INT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attempts_user_idx ON public.attempts(user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS attempts_question_idx ON public.attempts(question_id);

-- =====================================================
-- updated_at триггер для profiles
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================
-- Auto-create profile on signup
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for users, которые уже залогинились до этой миграции
INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT
  id,
  raw_user_meta_data ->> 'full_name',
  raw_user_meta_data ->> 'avatar_url'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Row Level Security
-- =====================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

-- profiles: only own
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- content: public read for authenticated
DROP POLICY IF EXISTS "subjects_select_authenticated" ON public.subjects;
CREATE POLICY "subjects_select_authenticated" ON public.subjects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "topics_select_authenticated" ON public.topics;
CREATE POLICY "topics_select_authenticated" ON public.topics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "contexts_select_authenticated" ON public.contexts;
CREATE POLICY "contexts_select_authenticated" ON public.contexts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "questions_select_published" ON public.questions;
CREATE POLICY "questions_select_published" ON public.questions
  FOR SELECT TO authenticated USING (is_published = true);

-- sessions: own only
DROP POLICY IF EXISTS "sessions_select_own" ON public.sessions;
CREATE POLICY "sessions_select_own" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_insert_own" ON public.sessions;
CREATE POLICY "sessions_insert_own" ON public.sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_update_own" ON public.sessions;
CREATE POLICY "sessions_update_own" ON public.sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- attempts: own only
DROP POLICY IF EXISTS "attempts_select_own" ON public.attempts;
CREATE POLICY "attempts_select_own" ON public.attempts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "attempts_insert_own" ON public.attempts;
CREATE POLICY "attempts_insert_own" ON public.attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
