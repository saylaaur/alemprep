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
-- =====================================================
-- Seed: subjects (3) + math topics по спецификации НЦТ (12)
-- =====================================================

INSERT INTO public.subjects (slug, name_ru, name_kk, icon, is_active, sort_order) VALUES
  ('math',        'Математика',  'Математика',  'Calculator', true,  1),
  ('physics',     'Физика',      'Физика',      'Atom',       false, 2),
  ('informatics', 'Информатика', 'Информатика', 'Code2',      false, 3)
ON CONFLICT (slug) DO NOTHING;

-- Math topics (по спецификации НЦТ — профильная математика)
INSERT INTO public.topics (subject_id, slug, name_ru, name_kk, sort_order)
SELECT s.id, t.slug, t.name_ru, t.name_kk, t.sort_order
FROM public.subjects s,
(VALUES
  ('algebra',        'Алгебраические выражения',       'Алгебралық өрнектер',          1),
  ('equations',      'Уравнения и неравенства',        'Теңдеулер мен теңсіздіктер',   2),
  ('functions',      'Функции и графики',              'Функциялар мен графиктер',     3),
  ('logarithms',     'Логарифмы',                       'Логарифмдер',                  4),
  ('trigonometry',   'Тригонометрия',                   'Тригонометрия',                5),
  ('progressions',   'Прогрессии',                      'Прогрессиялар',                6),
  ('planimetry',     'Планиметрия',                     'Планиметрия',                  7),
  ('stereometry',    'Стереометрия',                    'Стереометрия',                 8),
  ('derivatives',    'Производная и интеграл',         'Туынды және интеграл',         9),
  ('combinatorics',  'Комбинаторика и вероятность',    'Комбинаторика және ықтималдық', 10),
  ('statistics',     'Статистика',                      'Статистика',                   11),
  ('text_problems',  'Текстовые задачи',                'Мәтінді есептер',              12)
) AS t(slug, name_ru, name_kk, sort_order)
WHERE s.slug = 'math'
ON CONFLICT (subject_id, slug) DO NOTHING;
-- =====================================================
-- Seed: задачи по теме «Логарифмы»
-- Переписаны на основе пробника НЦТ — другие числа/условия,
-- математическая сложность сохранена.
-- =====================================================

-- 1. Single-choice: ln²x − 3lnx = 0
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 2,
  $json${
    "stem": "Найдите корни уравнения $\\ln^2 x - 3\\ln x = 0$",
    "options": [
      {"id": "A", "content": "$e^3$; $3$"},
      {"id": "B", "content": "$e^3$; $1$"},
      {"id": "C", "content": "$e^2$; $1$"},
      {"id": "D", "content": "$e$; $1$"}
    ],
    "correct": "B"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "Сделаем замену $t = \\ln x$, получим квадратное уравнение $t^2 - 3t = 0$."},
    {"type": "text", "value": "Вынесем $t$ за скобку: $t(t - 3) = 0$. Корни: $t = 0$ или $t = 3$."},
    {"type": "text", "value": "Возвращаемся к $x$: при $\\ln x = 0$ получаем $x = 1$; при $\\ln x = 3$ получаем $x = e^3$."}
  ]}$json$::jsonb,
  true, 1
FROM public.topics t WHERE t.slug = 'logarithms';

-- 2. Single-choice: log₂ 8 + log₃ 9
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 1,
  $json${
    "stem": "Вычислите $\\log_2 8 + \\log_3 9$",
    "options": [
      {"id": "A", "content": "$6$"},
      {"id": "B", "content": "$5$"},
      {"id": "C", "content": "$4$"},
      {"id": "D", "content": "$7$"}
    ],
    "correct": "B"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "$\\log_2 8 = \\log_2 2^3 = 3$, поскольку $2^3 = 8$."},
    {"type": "text", "value": "$\\log_3 9 = \\log_3 3^2 = 2$, поскольку $3^2 = 9$."},
    {"type": "text", "value": "Сумма: $3 + 2 = 5$."}
  ]}$json$::jsonb,
  true, 2
FROM public.topics t WHERE t.slug = 'logarithms';

-- 3. Single-choice: log₂ 32 − log₂ 4
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 1,
  $json${
    "stem": "Упростите выражение $\\log_2 32 - \\log_2 4$",
    "options": [
      {"id": "A", "content": "$2$"},
      {"id": "B", "content": "$3$"},
      {"id": "C", "content": "$4$"},
      {"id": "D", "content": "$5$"}
    ],
    "correct": "B"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "По свойству логарифмов разность можно записать как логарифм частного: $\\log_2 32 - \\log_2 4 = \\log_2 \\frac{32}{4} = \\log_2 8$."},
    {"type": "text", "value": "Поскольку $2^3 = 8$, получаем $\\log_2 8 = 3$."}
  ]}$json$::jsonb,
  true, 3
FROM public.topics t WHERE t.slug = 'logarithms';

-- 4. Single-choice: область определения y = log₅(x − 2)
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 2,
  $json${
    "stem": "Найдите область определения функции $y = \\log_5(x - 2)$",
    "options": [
      {"id": "A", "content": "$(2; +\\infty)$"},
      {"id": "B", "content": "$(-\\infty; 2)$"},
      {"id": "C", "content": "$[2; +\\infty)$"},
      {"id": "D", "content": "$(-\\infty; -2) \\cup (2; +\\infty)$"}
    ],
    "correct": "A"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "Логарифм определён только для положительных аргументов: $x - 2 > 0$, то есть $x > 2$."},
    {"type": "text", "value": "Значит область определения — открытый интервал $(2; +\\infty)$. Точка $x = 2$ не входит, поскольку $\\log_5 0$ не определён."}
  ]}$json$::jsonb,
  true, 4
FROM public.topics t WHERE t.slug = 'logarithms';

-- 5. Single-choice: log₂(x + 3) = 4
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 2,
  $json${
    "stem": "Решите уравнение $\\log_2(x + 3) = 4$",
    "options": [
      {"id": "A", "content": "$11$"},
      {"id": "B", "content": "$13$"},
      {"id": "C", "content": "$16$"},
      {"id": "D", "content": "$19$"}
    ],
    "correct": "B"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "По определению логарифма: $\\log_2(x + 3) = 4 \\iff x + 3 = 2^4 = 16$."},
    {"type": "text", "value": "Отсюда $x = 16 - 3 = 13$. Проверка ОДЗ: $13 + 3 = 16 > 0$ — подходит."}
  ]}$json$::jsonb,
  true, 5
FROM public.topics t WHERE t.slug = 'logarithms';

-- 6. Multi-select: какие из равенств верны
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'multi', 3,
  $json${
    "stem": "Какие из равенств верны? Выберите все правильные варианты.",
    "options": [
      {"id": "A", "content": "$\\log_3 9 = 2$"},
      {"id": "B", "content": "$\\log_5 25 = 2$"},
      {"id": "C", "content": "$\\log_2 8 = 4$"},
      {"id": "D", "content": "$\\log_{10} 100 = 2$"},
      {"id": "E", "content": "$\\log_4 2 = 2$"},
      {"id": "F", "content": "$\\log_7 49 = 3$"}
    ],
    "correct": ["A", "B", "D"]
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "Проверяем каждое равенство: $\\log_3 9 = 2$ верно ($3^2 = 9$). $\\log_5 25 = 2$ верно ($5^2 = 25$). $\\log_2 8 = 3$, не $4$ — неверно. $\\log_{10} 100 = 2$ верно. $\\log_4 2 = 1/2$, не $2$ — неверно. $\\log_7 49 = 2$, не $3$ — неверно."},
    {"type": "text", "value": "Правильные: A, B, D."}
  ]}$json$::jsonb,
  true, 6
FROM public.topics t WHERE t.slug = 'logarithms';

-- 7. Matching: соответствие между логарифмом и значением
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'matching', 2,
  $json${
    "stem": "Установите соответствие между логарифмом и его значением.",
    "left": [
      {"id": "A", "content": "$\\log_2 16$"},
      {"id": "B", "content": "$\\log_3 9$"},
      {"id": "C", "content": "$\\log_5 125$"}
    ],
    "right": ["2", "3", "4", "5"],
    "correct": {"A": "4", "B": "2", "C": "3"}
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "$\\log_2 16 = 4$, поскольку $2^4 = 16$."},
    {"type": "text", "value": "$\\log_3 9 = 2$, поскольку $3^2 = 9$."},
    {"type": "text", "value": "$\\log_5 125 = 3$, поскольку $5^3 = 125$."}
  ]}$json$::jsonb,
  true, 7
FROM public.topics t WHERE t.slug = 'logarithms';

-- 8 + 9. Контекстный блок: pH раствора (2 подзадачи)
WITH ctx AS (
  INSERT INTO public.contexts (topic_id, language, title, content)
  SELECT t.id, 'ru', 'pH раствора',
    $json${"blocks": [
      {"type": "text", "value": "В лабораторных исследованиях для измерения кислотности раствора используется pH-шкала, определяемая формулой:"},
      {"type": "latex", "value": "pH = -\\log_{10}[H^+]"},
      {"type": "text", "value": "где [H⁺] — концентрация ионов водорода в моль/л. Чем меньше pH, тем кислее раствор."}
    ]}$json$::jsonb
  FROM public.topics t WHERE t.slug = 'logarithms'
  RETURNING id, topic_id
),
q8 AS (
  INSERT INTO public.questions (topic_id, context_id, language, type, difficulty, body, explanation, is_published, sort_order)
  SELECT ctx.topic_id, ctx.id, 'ru', 'single', 2,
    $json${
      "stem": "Раствор имеет концентрацию ионов водорода $[H^+] = 10^{-3}$ моль/л. Найдите pH раствора.",
      "options": [
        {"id": "A", "content": "$3$"},
        {"id": "B", "content": "$-3$"},
        {"id": "C", "content": "$10$"},
        {"id": "D", "content": "$\\frac{1}{3}$"}
      ],
      "correct": "A"
    }$json$::jsonb,
    $json${"blocks": [
      {"type": "text", "value": "Подставляем в формулу: $pH = -\\log_{10}(10^{-3}) = -(-3) = 3$."}
    ]}$json$::jsonb,
    true, 8
  FROM ctx
  RETURNING id
)
INSERT INTO public.questions (topic_id, context_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT ctx.topic_id, ctx.id, 'ru', 'single', 2,
  $json${
    "stem": "Если pH раствора равен $5$, какова концентрация ионов водорода?",
    "options": [
      {"id": "A", "content": "$10^{-5}$ моль/л"},
      {"id": "B", "content": "$5$ моль/л"},
      {"id": "C", "content": "$-5$ моль/л"},
      {"id": "D", "content": "$10^5$ моль/л"}
    ],
    "correct": "A"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "Из формулы $pH = -\\log_{10}[H^+]$ выражаем $[H^+]$: $\\log_{10}[H^+] = -pH$, откуда $[H^+] = 10^{-pH}$."},
    {"type": "text", "value": "При $pH = 5$ получаем $[H^+] = 10^{-5}$ моль/л."}
  ]}$json$::jsonb,
  true, 9
FROM ctx;
