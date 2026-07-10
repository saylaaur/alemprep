-- =====================================================
-- Fix: гарантируем рабочие RLS-политики на public.profiles
--
-- Симптом: XP, стрик, дневная цель, язык НЕ сохранялись — UPDATE из
-- server actions молча затрагивал 0 строк (ошибки нет, попытка сохраняется).
-- При этом INSERT в attempts и user_achievements работал.
-- Причина: отсутствующая/устаревшая UPDATE-политика (БД поднималась через
-- устаревший run_all.sql). Пересоздаём политики явно и с WITH CHECK.
-- Идемпотентно — безопасно применять повторно.
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Читать своё
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Обновлять своё (главный фикс: XP/стрик/настройки)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Вставлять своё (на всякий — для триггера/бэкфилла)
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
