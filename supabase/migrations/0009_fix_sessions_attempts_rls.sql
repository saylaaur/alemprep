-- =====================================================
-- Fix: восстанавливаем RLS-политики на sessions и attempts
--
-- Та же причина, что в 0008 (profiles): БД поднималась через устаревший
-- run_all.sql, где часть политик отсутствовала.
-- Симптом: «Не удалось сохранить пробник» — finishExamSession не мог сделать
-- UPDATE sessions (нет sessions_update_own). Пересоздаём политики явно.
-- Идемпотентно — безопасно применять повторно.
-- =====================================================

-- ---- sessions ----
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own" ON public.sessions;
CREATE POLICY "sessions_select_own" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_insert_own" ON public.sessions;
CREATE POLICY "sessions_insert_own" ON public.sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Главный фикс: завершение пробника (UPDATE correct_count/score/finished_at)
DROP POLICY IF EXISTS "sessions_update_own" ON public.sessions;
CREATE POLICY "sessions_update_own" ON public.sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---- attempts ----
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attempts_select_own" ON public.attempts;
CREATE POLICY "attempts_select_own" ON public.attempts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "attempts_insert_own" ON public.attempts;
CREATE POLICY "attempts_insert_own" ON public.attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- DELETE нужен для отката попытки при сбое (rollback в recordAttempt/finishExamSession)
DROP POLICY IF EXISTS "attempts_delete_own" ON public.attempts;
CREATE POLICY "attempts_delete_own" ON public.attempts
  FOR DELETE USING (auth.uid() = user_id);
