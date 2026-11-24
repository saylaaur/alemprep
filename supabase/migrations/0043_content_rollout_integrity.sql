-- Explicit grants for projects that do not expose new tables by default.
REVOKE ALL ON public.books, public.user_books, public.book_reviews,
  public.telegram_links, public.telegram_link_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.books, public.user_books, public.book_reviews,
  public.telegram_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books, public.user_books,
  public.book_reviews, public.telegram_links, public.telegram_link_codes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.book_reviews_id_seq TO service_role;

-- Apply the new schedule and write its review together.
CREATE FUNCTION public.record_book_review_v1(
  p_user_id uuid, p_book_id uuid, p_previous_stage smallint, p_previous_due_on date,
  p_stage smallint, p_due_on date, p_reviewed_on date, p_reviewed_at timestamptz,
  p_recalled numeric, p_lapse boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.user_books
  SET stage = p_stage, due_on = p_due_on, last_reviewed_at = p_reviewed_at,
      reviews_count = reviews_count + 1, lapses = lapses + p_lapse::integer
  WHERE user_id = p_user_id AND book_id = p_book_id
    AND stage = p_previous_stage AND due_on = p_previous_due_on AND due_on <= p_reviewed_on;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.book_reviews (
    user_id, book_id, reviewed_on, reviewed_at, recalled, counted,
    stage_before, stage_after, due_on_after
  ) VALUES (
    p_user_id, p_book_id, p_reviewed_on, p_reviewed_at, p_recalled, true,
    p_previous_stage, p_stage, p_due_on
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_book_review_v1(
  uuid, uuid, smallint, date, smallint, date, date, timestamptz, numeric, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_book_review_v1(
  uuid, uuid, smallint, date, smallint, date, date, timestamptz, numeric, boolean
) TO service_role;

-- Consume a Telegram link code and replace the binding together.
CREATE FUNCTION public.link_telegram_account_v1(p_code text, p_chat_id bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  linked_user_id uuid;
BEGIN
  DELETE FROM public.telegram_link_codes
  WHERE code = p_code AND expires_at > now()
  RETURNING user_id INTO linked_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.telegram_links
  WHERE chat_id = p_chat_id AND user_id <> linked_user_id;
  INSERT INTO public.telegram_links (user_id, chat_id, linked_at, last_reminded_on)
  VALUES (linked_user_id, p_chat_id, now(), NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    chat_id = EXCLUDED.chat_id, linked_at = EXCLUDED.linked_at, last_reminded_on = NULL;
  RETURN linked_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_telegram_account_v1(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_telegram_account_v1(text, bigint) TO service_role;
