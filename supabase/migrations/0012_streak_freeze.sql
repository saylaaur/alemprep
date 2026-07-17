-- =====================================================
-- 0012: Заморозка стрика (как в Duolingo)
--
-- profiles.streak_freezes — сколько заморозок доступно сейчас (стартовый
-- баланс — 1, начисление — см. lib/streak.ts awardStreakFreezes).
-- profiles.last_freeze_used_date — дата (YYYY-MM-DD), на которую пришлось
-- последнее списание заморозки. UI сравнивает её с last_active_date, чтобы
-- показать метку «заморозка спасла серию» ровно в тот заход, когда
-- заморозка сработала (см. getGamification / dashboard).
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_freezes INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_freeze_used_date DATE;

-- =====================================================
-- Пересоздаём RLS-политики profiles (см. 0008/0009/0010 — в проде терялись
-- при поднятии БД через устаревший run_all.sql). Идемпотентно, безопасно
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
