-- =====================================================
-- 0010: Онбординг — поля профиля (пара предметов, дата ЕНТ, целевой балл)
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS second_subject TEXT CHECK (second_subject IN ('physics', 'informatics')),
  ADD COLUMN IF NOT EXISTS exam_date DATE,
  ADD COLUMN IF NOT EXISTS target_score INT CHECK (target_score BETWEEN 1 AND 140);

-- =====================================================
-- Пересоздаём RLS-политики profiles (см. 0008/0009 — в проде терялись при
-- поднятии БД через устаревший run_all.sql). Идемпотентно, безопасно
-- применять повторно.
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
