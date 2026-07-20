-- =====================================================
-- 0016: Диалог с ИИ-ассистентом — ai_turns
--
-- Раньше askAssistant отвечал на каждый клик заново, без памяти о предыдущих
-- репликах — ассистент не ощущался диалогом. ai_turns хранит историю по
-- (user_id, question_id): и реплики ученика (пресет или свободный вопрос),
-- и ответы ассистента. Сервер строит контекст модели и признак «ответ
-- раскрыт» из БД на каждый запрос — клиент их не присылает (см.
-- lib/supabase/assistant-actions.ts).
--
-- mode — ключ пресета для реплики ученика ('hint'/'why-wrong'/'simpler') или
-- NULL для свободного вопроса/ответа на него: UI переводит пресет через
-- next-intl, чтобы казахская версия не увидела захардкоженный русский текст.
--
-- RLS: строго «только своё», без UPDATE/DELETE — лог неизменяем.
-- Заодно пересоздаём inline RLS-политики profiles по устоявшемуся паттерну
-- (0008/0010/0012/0014 — в проде терялись при поднятии БД через устаревший
-- run_all.sql). Идемпотентно, безопасно применять повторно.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ai_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student','assistant')),
  mode TEXT CHECK (mode IS NULL OR mode IN ('hint','why-wrong','simpler','ask')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_turns_user_question_idx
  ON public.ai_turns(user_id, question_id, created_at);

ALTER TABLE public.ai_turns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_turns_select_own" ON public.ai_turns;
CREATE POLICY "ai_turns_select_own" ON public.ai_turns
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_turns_insert_own" ON public.ai_turns;
CREATE POLICY "ai_turns_insert_own" ON public.ai_turns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- profiles — пересоздаём политики по устоявшемуся паттерну (см. заголовок).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
