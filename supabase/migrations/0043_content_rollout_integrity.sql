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

-- 0042 seeded this catalog entry before its draft book was bundled.
UPDATE public.books
SET content_ru = '{"pages":[{"kicker":"Основные понятия","title":"Что такое ускорение","blocks":[{"type":"list","items":["**Ускорение** $a$ показывает, на сколько меняется скорость за каждую секунду. Единица — м/с².","**Равноускоренное** движение — ускорение постоянно, $a = const$. Скорость растёт (или падает) равномерно.","Если $a$ направлено так же, как скорость, тело разгоняется; если противоположно — тормозит."]},{"type":"note","text":"Ускорение 2 м/с² значит: каждую секунду скорость растёт на 2 м/с. Было 3 м/с — станет 5, потом 7, потом 9."}]},{"kicker":"Скорость","title":"Как растёт скорость","blocks":[{"type":"formula","tex":"a = \\frac{v - v_0}{t}"},{"type":"formula","tex":"v = v_0 + a t"},{"type":"list","items":["$v_0$ — начальная скорость, $v$ — скорость в момент $t$.","Из покоя $v_0 = 0$, поэтому $v = at$.","График $v(t)$ — прямая линия. Наклон прямой — это ускорение."]}]},{"kicker":"Путь","title":"Сколько тело проехало","blocks":[{"type":"formula","tex":"s = v_0 t + \\frac{a t^2}{2}"},{"type":"list","items":["Из покоя: $s = \\frac{at^2}{2}$. Путь растёт как $t^2$: время ×2 — путь ×4.","Если известны обе скорости: $s = \\frac{v_0 + v}{2}\\,t$ (средняя скорость на прямой).","Если неизвестно время: $s = \\frac{v^2 - v_0^2}{2a}$."]},{"type":"note","text":"Выбирай формулу по тому, чего в задаче нет. Нет времени — формула со скоростями. Нет конечной скорости — формула $v_0 t + \\frac{at^2}{2}$."}]},{"kicker":"Торможение","title":"Знаки и остановка","blocks":[{"type":"text","text":"При торможении ускорение направлено против скорости. В формулах его берут со знаком минус, а в тексте задачи чаще пишут модуль."},{"type":"list","items":["До остановки $v = 0$: время торможения $t = \\frac{v_0}{a}$.","Тормозной путь $s = \\frac{v_0^2}{2a}$ — он растёт как квадрат скорости.","Скорость вдвое больше — тормозной путь вчетверо длиннее."]}]},{"kicker":"Ловушки ЕНТ","title":"Где чаще всего ошибаются","blocks":[{"type":"trap","items":["Скорость в км/ч переводи в м/с: дели на 3,6. Сначала единицы, потом формулы.","Забыть поделить на 2 в $\\frac{at^2}{2}$ — самая частая ошибка.","«Путь за n-ю секунду» — это не путь за $n$ секунд, а разность путей за $n$ и за $n-1$ секунд.","Пути за 1, 2, 3 секунды из покоя относятся как $1 : 3 : 5$, а за всё время — как $1 : 4 : 9$.","Нашёл $at$ — ещё не скорость: к нему нужно добавить $v_0$."]}]},{"kicker":"Проверь себя","title":"Ответь без подсказок","blocks":[{"type":"list","ordered":true,"items":["Из покоя ускорение 2 м/с². Какая скорость через 6 с?","Какой путь пройдёт то же тело за эти 6 с?","Автомобиль едет 20 м/с и тормозит с ускорением 5 м/с². Тормозной путь?","Во сколько раз изменится тормозной путь, если скорость вырастет в 3 раза?"]},{"type":"note","text":"Ответы: 12 м/с · 36 м · 40 м · вырастет в 9 раз."}]}]}'::jsonb,
    content_kk = '{"pages":[{"kicker":"Негізгі ұғымдар","title":"Үдеу дегеніміз не","blocks":[{"type":"list","items":["**Үдеу** $a$ жылдамдықтың әр секундта қаншаға өзгеретінін көрсетеді. Өлшем бірлігі — м/с².","**Бірқалыпты үдемелі** қозғалыста үдеу тұрақты, $a = const$. Жылдамдық біркелкі артады (немесе кемиді).","Егер $a$ жылдамдықпен бағыттас болса, дене үдейді; қарама-қарсы болса — тежеледі."]},{"type":"note","text":"2 м/с² үдеу әр секундта жылдамдық 2 м/с-қа артады дегенді білдіреді. 3 м/с болды — 5, содан 7, содан 9 болады."}]},{"kicker":"Жылдамдық","title":"Жылдамдық қалай артады","blocks":[{"type":"formula","tex":"a = \\frac{v - v_0}{t}"},{"type":"formula","tex":"v = v_0 + a t"},{"type":"list","items":["$v_0$ — бастапқы жылдамдық, $v$ — $t$ мезетіндегі жылдамдық.","Тыныштықтан бастағанда $v_0 = 0$, сондықтан $v = at$.","$v(t)$ графигі — түзу сызық. Түзудің еңісі — үдеу."]}]},{"kicker":"Жол","title":"Дене қанша жол жүрді","blocks":[{"type":"formula","tex":"s = v_0 t + \\frac{a t^2}{2}"},{"type":"list","items":["Тыныштықтан: $s = \\frac{at^2}{2}$. Жол $t^2$-қа пропорционал: уақыт ×2 — жол ×4.","Екі жылдамдық белгілі болса: $s = \\frac{v_0 + v}{2}\\,t$ (түзудегі орташа жылдамдық).","Уақыт белгісіз болса: $s = \\frac{v^2 - v_0^2}{2a}$."]},{"type":"note","text":"Формуланы есепте не жетіспейтініне қарай таңда. Уақыт жоқ — жылдамдықтармен формула. Соңғы жылдамдық жоқ — $v_0 t + \\frac{at^2}{2}$ формуласы."}]},{"kicker":"Тежелу","title":"Таңбалар және тоқтау","blocks":[{"type":"text","text":"Тежелгенде үдеу жылдамдыққа қарсы бағытталады. Формулаларда оны минус таңбасымен алады, ал есеп мәтінінде көбіне модулін жазады."},{"type":"list","items":["Тоқтағанға дейін $v = 0$: тежелу уақыты $t = \\frac{v_0}{a}$.","Тежелу жолы $s = \\frac{v_0^2}{2a}$ — ол жылдамдықтың квадратындай өседі.","Жылдамдық екі есе артса, тежелу жолы төрт есе ұзарады."]}]},{"kicker":"ҰБТ тұзақтары","title":"Жиі қателесетін жерлер","blocks":[{"type":"trap","items":["км/сағ-ты м/с-қа аудар: 3,6-ға бөл. Алдымен өлшем бірліктер, сосын формулалар.","$\\frac{at^2}{2}$ формуласында 2-ге бөлуді ұмыту — ең жиі қате.","«n-ші секундтағы жол» — $n$ секундтағы жол емес, $n$ және $n-1$ секундтағы жолдардың айырмасы.","Тыныштықтан 1, 2, 3-ші секундтағы жолдар $1 : 3 : 5$ сияқты, ал барлық уақыттағы жолдар — $1 : 4 : 9$.","$at$ тапқаның — әлі жылдамдық емес: оған $v_0$ қосу керек."]}]},{"kicker":"Өзіңді тексер","title":"Көмексіз жауап бер","blocks":[{"type":"list","ordered":true,"items":["Тыныштықтан үдеу 2 м/с². 6 с-тан кейінгі жылдамдық қандай?","Сол дене осы 6 с-та қанша жол жүреді?","Автомобиль 20 м/с жылдамдықпен келеді, 5 м/с² үдеумен тежеледі. Тежелу жолы қандай?","Жылдамдық 3 есе артса, тежелу жолы неше есе өзгереді?"]},{"type":"note","text":"Жауаптар: 12 м/с · 36 м · 40 м · 9 есе артады."}]}]}'::jsonb
WHERE slug = 'accelerated-motion' AND content_ru IS NULL;
