-- =====================================================
-- 0017: Переводы задач — questions.source_question_id
--
-- Казахских задач в базе ноль (interfaces переведён, контента нет). Вместо
-- перевода на лету — переводим 693 проверенные русские задачи один раз в
-- базу (см. scripts/translate-questions.ts). Каждый казахский перевод —
-- отдельная строка questions с language='kk' и source_question_id, который
-- указывает на русский оригинал (source_question_id IS NULL у оригиналов).
--
-- Даёт: (а) повторный прогон пайплайна не плодит дубли (проверка по
-- source_question_id+language), (б) перевод можно позже обновить/удалить не
-- трогая оригинал, (в) видно, какие задачи ещё не переведены (LEFT JOIN на
-- отсутствие строки с этим source_question_id и language='kk').
--
-- ON DELETE CASCADE: удаление оригинала убирает и его переводы — сирота
-- без source-текста никому не нужна.
--
-- Заодно пересоздаём inline RLS-политики profiles по устоявшемуся паттерну
-- (0008/0010/0012/0014/0016 — в проде терялись при поднятии БД через
-- устаревший run_all.sql). Идемпотентно, безопасно применять повторно.
-- =====================================================

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source_question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS questions_source_idx ON public.questions(source_question_id);

-- Один перевод на язык на оригинал: повторный прогон translate-questions.ts
-- не может вставить второй kk-перевод того же source_question_id.
CREATE UNIQUE INDEX IF NOT EXISTS questions_translation_unique
  ON public.questions(source_question_id, language)
  WHERE source_question_id IS NOT NULL;

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
