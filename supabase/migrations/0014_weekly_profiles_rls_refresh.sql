-- =====================================================
-- 0014: Еженедельные тесты не добавляют колонок в profiles — finishWeeklyTest
-- пишет XP/стрик через те же UPDATE, что и finishExamSession. Тем не менее
-- пересоздаём RLS-политики profiles по устоявшейся привычке (см.
-- 0008/0009/0010/0012 — в проде терялись при поднятии БД через устаревший
-- run_all.sql). Идемпотентно, безопасно применять повторно.
-- =====================================================

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
