-- =====================================================
-- 0021: Защита счётчиков ИИ от прямой мутации пользователем
--
-- До этой миграции RLS разрешал authenticated пользователю UPDATE своей
-- строки ai_usage. Через публичный Supabase API он мог сбросить count в 0 и
-- обойти дневной лимит. Кроме того, increment_ai_global_usage был доступен
-- authenticated и позволял любому пользователю портить общий бюджетный
-- счётчик.
-- =====================================================

-- Пользователь по-прежнему может читать собственный остаток, но изменяет
-- счётчик только через атомарную функцию ниже.
DROP POLICY IF EXISTS "ai_usage_insert_own" ON public.ai_usage;
DROP POLICY IF EXISTS "ai_usage_update_own" ON public.ai_usage;

REVOKE ALL PRIVILEGES ON TABLE public.ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ai_usage TO authenticated;

-- Возвращает новое значение count либо NULL, когда дневной лимит уже
-- исчерпан. user_id никогда не принимается аргументом: источник истины —
-- auth.uid(). Дата также не приходит от клиента: её определяет БД в часовом
-- поясе продукта. Число 5 должно оставаться синхронным с AI_DAILY_LIMIT.
CREATE OR REPLACE FUNCTION public.consume_ai_daily_quota()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_usage_date DATE := timezone('Asia/Almaty', now())::DATE;
  v_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_usage (user_id, usage_date, count)
  VALUES (v_user_id, v_usage_date, 1)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET count = public.ai_usage.count + 1
    WHERE public.ai_usage.count < 5
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_daily_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_daily_quota() TO authenticated;

-- Общий счётчик относится ко всему проекту, поэтому его меняет только
-- серверный service-role клиент после успешного ответа модели.
REVOKE ALL ON FUNCTION public.increment_ai_global_usage(INT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_global_usage(INT, INT) TO service_role;

-- Чтение общего остатка нужно authenticated server action до списания личной
-- квоты, но анонимный вызов функции не нужен.
REVOKE ALL ON FUNCTION public.get_ai_global_usage_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_global_usage_count() TO authenticated, service_role;
