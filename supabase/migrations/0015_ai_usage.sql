-- =====================================================
-- 0015: Дневной лимит ИИ-ассистента
--
-- ai_usage — счётчик запросов к ИИ-ассистенту (Слой 2 в docs/ai-assistant-design.md)
-- по пользователю и дню. Один ряд на (user_id, usage_date), count инкрементируется
-- server action'ом ДО вызова модели — так лимит не позволяет уйти в минус по деньгам
-- при гонке/ретрае (см. lib/supabase/assistant-actions.ts).
--
-- RLS: строго «только своё», с WITH CHECK на insert/update — тот же урок, что
-- в 0008 (без WITH CHECK запись может молча пройти мимо владельца).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_select_own" ON public.ai_usage;
CREATE POLICY "ai_usage_select_own" ON public.ai_usage
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_usage_insert_own" ON public.ai_usage;
CREATE POLICY "ai_usage_insert_own" ON public.ai_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_usage_update_own" ON public.ai_usage;
CREATE POLICY "ai_usage_update_own" ON public.ai_usage
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
