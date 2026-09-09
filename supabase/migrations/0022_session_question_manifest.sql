-- Состав пробника фиксируется в момент старта. Это не позволяет клиенту
-- завершить сессию ответами на другие существующие вопросы из общего банка.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS question_ids UUID[];

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_question_ids_count_check
  CHECK (question_ids IS NULL OR cardinality(question_ids) = total_questions);
