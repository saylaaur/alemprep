-- =====================================================
-- 0007: Gamification — XP, longest_streak, user_achievements
-- =====================================================

-- 1. XP и рекорд стрика на профиле
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INT NOT NULL DEFAULT 0;

-- Backfill: рекорд не может быть меньше текущего стрика
UPDATE public.profiles
  SET longest_streak = current_streak
  WHERE longest_streak < current_streak;

-- 2. Полученные достижения (по одному ключу на пользователя)
CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_idx
  ON public.user_achievements(user_id);

-- 3. RLS: только свои достижения
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_achievements_select_own" ON public.user_achievements;
CREATE POLICY "user_achievements_select_own" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_achievements_insert_own" ON public.user_achievements;
CREATE POLICY "user_achievements_insert_own" ON public.user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);
