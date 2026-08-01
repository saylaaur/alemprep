-- =====================================================
-- 0017: Глобальный дневной потолок ИИ-ассистента
--
-- ai_global_usage — суммарный расход (запросы + реальные токены) по ВСЕМ
-- ученикам за день. Персональный лимит (ai_usage, 0015) не спасает от
-- перерасхода бюджета партнёра на пилот (~$50/мес): 300 учеников × 5 запросов
-- = 1500/день. ai_global_usage — предохранитель поверх персонального лимита
-- (см. lib/assistant.ts AI_GLOBAL_DAILY_REQUEST_LIMIT и
-- lib/supabase/assistant-actions.ts).
--
-- usage_date — CURRENT_DATE в Postgres (UTC). Осознанный компромисс: потолок
-- глобальный и грубый, сдвиг границы суток на ~5ч (Алматы = UTC+5) не
-- критичен — в отличие от персонального ai_usage, который считает по
-- localDateStr() сервера ради UX конкретного ученика.
--
-- RLS: НЕТ политик для authenticated — таблица общая, не принадлежит
-- конкретному ученику, обычному пользователю доступа нет вообще. Инкремент —
-- атомарный RPC (иначе гонка при параллельных запросах недосчитает).
--
-- Чтение тоже идёт через SECURITY DEFINER функцию, а не напрямую SELECT: в
-- этом проекте server actions ходят под anon-key + cookie сессией ученика
-- (см. lib/supabase/server.ts) — то есть под ролью authenticated, НЕ под
-- service_role. Прямой SELECT authenticated-ролью без политик RLS тихо
-- вернул бы 0 строк всегда (не ошибку!), и глобальный лимит никогда бы не
-- сработал. get_ai_global_usage_count() держит тот же принцип «обычному
-- ученику доступа нет», но даёт server action реально прочитать счётчик.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ai_global_usage (
  usage_date DATE PRIMARY KEY,
  request_count INT NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0
);

ALTER TABLE public.ai_global_usage ENABLE ROW LEVEL SECURITY;
-- Намеренно без политик для authenticated — см. заголовок.

CREATE OR REPLACE FUNCTION public.increment_ai_global_usage(p_input INT, p_output INT)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.ai_global_usage (usage_date, request_count, input_tokens, output_tokens)
  VALUES (CURRENT_DATE, 1, p_input, p_output)
  ON CONFLICT (usage_date) DO UPDATE SET
    request_count = ai_global_usage.request_count + 1,
    input_tokens  = ai_global_usage.input_tokens + p_input,
    output_tokens = ai_global_usage.output_tokens + p_output;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_global_usage_count()
RETURNS INT LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT request_count FROM public.ai_global_usage WHERE usage_date = CURRENT_DATE), 0);
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_global_usage(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_global_usage_count() TO authenticated;

-- profiles — пересоздаём политики по устоявшемуся паттерну (0008/0010/0012/0014/0016).
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
