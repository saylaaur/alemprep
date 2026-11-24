-- =====================================================
-- 0042: книги-конспекты и интервальное повторение
-- =====================================================
-- Книга = конспект одной подтемы официальной темы НЦТ (topics). Ученик
-- получает книгу после урока и повторяет её через 1, 3, 7, 10, 14, 30, 60 дней
-- (промежутки между повторениями, см. lib/books/schedule.ts).
--
-- Сид сгенерирован scripts/build-books-migration.ts из
-- scripts/data/books-catalog.json — не править руками, перегенерировать.
--
-- Записи ученика (user_books, book_reviews) меняет только сервер
-- (service_role) — браузер может лишь читать свои строки. Так же устроены
-- XP и серии (0023): график нельзя «подкрутить» из клиента.
-- =====================================================

CREATE TABLE public.books (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order  INT NOT NULL,
  name_ru     TEXT NOT NULL,
  name_kk     TEXT,
  -- NULL — конспект ещё готовится (книга видна в плане, но её нельзя получить)
  content_ru  JSONB,
  content_kk  JSONB,
  -- для списков: не тянуть весь конспект, чтобы узнать, готов ли он
  has_content BOOLEAN GENERATED ALWAYS AS (content_ru IS NOT NULL) STORED,
  video_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (topic_id, sort_order)
);
CREATE TRIGGER books_updated_at BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- stage: сколько повторений засчитано (0..7); due_on NULL — книга выучена.
CREATE TABLE public.user_books (
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id          UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  received_on      DATE NOT NULL,
  stage            SMALLINT NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 7),
  due_on           DATE,
  reviews_count    INT NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  lapses           INT NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  last_reviewed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id),
  CHECK ((stage = 7) = (due_on IS NULL))
);
CREATE INDEX user_books_due_idx ON public.user_books (due_on) WHERE due_on IS NOT NULL;

CREATE TABLE public.book_reviews (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id      UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  reviewed_on  DATE NOT NULL,
  reviewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  recalled     NUMERIC(4,3) NOT NULL CHECK (recalled BETWEEN 0 AND 1),
  counted      BOOLEAN NOT NULL,
  stage_before SMALLINT NOT NULL,
  stage_after  SMALLINT NOT NULL,
  due_on_after DATE
);
CREATE INDEX book_reviews_user_day_idx ON public.book_reviews (user_id, reviewed_on);

-- Telegram: привязка чата и одноразовые коды для /start
CREATE TABLE public.telegram_links (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id   BIGINT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reminded_on DATE
);
CREATE TABLE public.telegram_link_codes (
  code       TEXT PRIMARY KEY CHECK (code ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ── RLS ──
ALTER TABLE public.books               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_books          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "books_select_authenticated" ON public.books
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_books_select_own" ON public.user_books
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "book_reviews_select_own" ON public.book_reviews
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "telegram_links_select_own" ON public.telegram_links
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Писать в эти таблицы может только сервер.
REVOKE INSERT, UPDATE, DELETE ON public.books, public.user_books, public.book_reviews, public.telegram_links
  FROM anon, authenticated;
REVOKE ALL ON public.telegram_link_codes FROM anon, authenticated;

-- ── Каталог книг ──
INSERT INTO public.books (topic_id, sort_order, slug, name_ru, name_kk, content_ru, content_kk)
SELECT t.id, v.sort_order, v.slug, v.name_ru, v.name_kk, v.content_ru, v.content_kk
FROM (VALUES
  ('math', 'radicals-and-expressions', 1, 'arithmetic-roots', 'Арифметический корень и его свойства', 'Арифметикалық түбір және оның қасиеттері', NULL, NULL),
  ('math', 'radicals-and-expressions', 2, 'radical-transformations', 'Преобразование выражений с корнями, избавление от иррациональности в знаменателе', 'Түбірі бар өрнектерді түрлендіру, бөлімдегі иррационалдықтан арылу', NULL, NULL),
  ('math', 'radicals-and-expressions', 3, 'fractions-and-numeric', 'Обыкновенные и десятичные дроби, числовые выражения', 'Жай және ондық бөлшектер, сандық өрнектер', NULL, NULL),
  ('math', 'radicals-and-expressions', 4, 'rational-expressions', 'Целые и дробные выражения, область допустимых значений', 'Бүтін және бөлшек өрнектер, мүмкін мәндер облысы', NULL, NULL),
  ('math', 'powers', 1, 'integer-powers', 'Степень с целым показателем', 'Бүтін көрсеткішті дәреже', NULL, NULL),
  ('math', 'powers', 2, 'rational-powers', 'Степень с рациональным показателем', 'Рационал көрсеткішті дәреже', NULL, NULL),
  ('math', 'powers', 3, 'power-expressions', 'Преобразование выражений со степенями', 'Дәрежесі бар өрнектерді түрлендіру', NULL, NULL),
  ('math', 'powers', 4, 'logarithm-properties', 'Логарифм и его свойства', 'Логарифм және оның қасиеттері', NULL, NULL),
  ('math', 'trigonometry', 1, 'trig-unit-circle', 'Радианная мера угла, единичная окружность', 'Бұрыштың радиандық өлшемі, бірлік шеңбер', NULL, NULL),
  ('math', 'trigonometry', 2, 'trig-definitions-signs', 'Синус, косинус, тангенс, котангенс: определения, знаки, значения', 'Синус, косинус, тангенс, котангенс: анықтамалары, таңбалары, мәндері', NULL, NULL),
  ('math', 'trigonometry', 3, 'trig-basic-identities', 'Основные тригонометрические тождества', 'Негізгі тригонометриялық тепе-теңдіктер', NULL, NULL),
  ('math', 'trigonometry', 4, 'trig-reduction-formulas', 'Формулы приведения', 'Келтіру формулалары', NULL, NULL),
  ('math', 'trigonometry', 5, 'trig-sum-formulas', 'Формулы сложения', 'Қосу формулалары', NULL, NULL),
  ('math', 'trigonometry', 6, 'trig-double-half', 'Формулы двойного и половинного угла', 'Қос және жарты бұрыш формулалары', NULL, NULL),
  ('math', 'trigonometry', 7, 'trig-sum-to-product', 'Преобразование суммы в произведение и произведения в сумму', 'Қосындыны көбейтіндіге және көбейтіндіні қосындыға түрлендіру', NULL, NULL),
  ('math', 'trigonometry', 8, 'inverse-trig', 'Обратные тригонометрические функции: arcsin, arccos, arctg', 'Кері тригонометриялық функциялар: arcsin, arccos, arctg', NULL, NULL),
  ('math', 'trigonometry', 9, 'trig-functions-graphs', 'Тригонометрические функции, их свойства и графики', 'Тригонометриялық функциялар, олардың қасиеттері мен графиктері', NULL, NULL),
  ('math', 'algebraic-expressions', 1, 'polynomials', 'Одночлены и многочлены', 'Бірмүшелер және көпмүшелер', NULL, NULL),
  ('math', 'algebraic-expressions', 2, 'short-multiplication', 'Формулы сокращённого умножения', 'Қысқаша көбейту формулалары', NULL, NULL),
  ('math', 'algebraic-expressions', 3, 'factoring', 'Разложение многочлена на множители', 'Көпмүшені көбейткіштерге жіктеу', NULL, NULL),
  ('math', 'algebraic-expressions', 4, 'algebraic-fractions', 'Алгебраические дроби и упрощение выражений', 'Алгебралық бөлшектер және өрнектерді ықшамдау', NULL, NULL),
  ('math', 'linear-quadratic-rational-equations', 1, 'linear-equations', 'Линейные уравнения и уравнения с модулем', 'Сызықтық теңдеулер және модуль таңбасы бар теңдеулер', NULL, NULL),
  ('math', 'linear-quadratic-rational-equations', 2, 'quadratic-equations', 'Квадратные уравнения, дискриминант', 'Квадрат теңдеулер, дискриминант', NULL, NULL),
  ('math', 'linear-quadratic-rational-equations', 3, 'vieta', 'Теорема Виета', 'Виет теоремасы', NULL, NULL),
  ('math', 'linear-quadratic-rational-equations', 4, 'rational-equations', 'Дробно-рациональные уравнения', 'Бөлшек-рационал теңдеулер', NULL, NULL),
  ('math', 'linear-quadratic-rational-equations', 5, 'higher-degree-equations', 'Уравнения высших степеней, замена переменной', 'Жоғары дәрежелі теңдеулер, айнымалыны алмастыру', NULL, NULL),
  ('math', 'trig-irrational-equations', 1, 'simplest-trig-equations', 'Простейшие тригонометрические уравнения', 'Қарапайым тригонометриялық теңдеулер', NULL, NULL),
  ('math', 'trig-irrational-equations', 2, 'trig-equations-methods', 'Методы решения тригонометрических уравнений', 'Тригонометриялық теңдеулерді шешу әдістері', NULL, NULL),
  ('math', 'trig-irrational-equations', 3, 'trig-equations-interval', 'Отбор корней тригонометрического уравнения на промежутке', 'Тригонометриялық теңдеудің аралықтағы түбірлерін іріктеу', NULL, NULL),
  ('math', 'trig-irrational-equations', 4, 'irrational-equations', 'Иррациональные уравнения', 'Иррационал теңдеулер', NULL, NULL),
  ('math', 'exponential-log-equations', 1, 'exp-log-functions', 'Показательная и логарифмическая функции', 'Көрсеткіштік және логарифмдік функциялар', NULL, NULL),
  ('math', 'exponential-log-equations', 2, 'exponential-equations', 'Показательные уравнения', 'Көрсеткіштік теңдеулер', NULL, NULL),
  ('math', 'exponential-log-equations', 3, 'logarithmic-equations', 'Логарифмические уравнения', 'Логарифмдік теңдеулер', NULL, NULL),
  ('math', 'linear-nonlinear-systems', 1, 'linear-systems', 'Системы линейных уравнений: подстановка и сложение', 'Сызықтық теңдеулер жүйесі: алмастыру және қосу тәсілдері', NULL, NULL),
  ('math', 'linear-nonlinear-systems', 2, 'nonlinear-systems', 'Системы нелинейных уравнений с двумя переменными', 'Екі айнымалысы бар сызықтық емес теңдеулер жүйесі', NULL, NULL),
  ('math', 'linear-nonlinear-systems', 3, 'systems-word-problems', 'Текстовые задачи на системы уравнений', 'Теңдеулер жүйесі арқылы шығарылатын мәтінді есептер', NULL, NULL),
  ('math', 'special-equation-systems', 1, 'trig-irrational-systems', 'Системы тригонометрических и иррациональных уравнений', 'Тригонометриялық және иррационал теңдеулер жүйесі', NULL, NULL),
  ('math', 'special-equation-systems', 2, 'exp-log-systems', 'Системы показательных и логарифмических уравнений', 'Көрсеткіштік және логарифмдік теңдеулер жүйесі', NULL, NULL),
  ('math', 'inequalities', 1, 'linear-inequalities', 'Линейные неравенства и неравенства с модулем', 'Сызықтық теңсіздіктер және модуль таңбасы бар теңсіздіктер', NULL, NULL),
  ('math', 'inequalities', 2, 'quadratic-inequalities', 'Квадратные неравенства', 'Квадрат теңсіздіктер', NULL, NULL),
  ('math', 'inequalities', 3, 'interval-method', 'Метод интервалов, рациональные неравенства', 'Интервалдар әдісі, рационал теңсіздіктер', NULL, NULL),
  ('math', 'inequalities', 4, 'trig-inequalities', 'Простейшие тригонометрические неравенства', 'Қарапайым тригонометриялық теңсіздіктер', NULL, NULL),
  ('math', 'inequalities', 5, 'irrational-inequalities', 'Иррациональные неравенства', 'Иррационал теңсіздіктер', NULL, NULL),
  ('math', 'inequalities', 6, 'exp-inequalities', 'Показательные неравенства', 'Көрсеткіштік теңсіздіктер', NULL, NULL),
  ('math', 'inequalities', 7, 'log-inequalities', 'Логарифмические неравенства', 'Логарифмдік теңсіздіктер', NULL, NULL),
  ('math', 'inequality-systems', 1, 'linear-inequality-systems', 'Системы линейных неравенств', 'Сызықтық теңсіздіктер жүйесі', NULL, NULL),
  ('math', 'inequality-systems', 2, 'rational-inequality-systems', 'Системы дробно-рациональных и нелинейных неравенств', 'Бөлшек-рационал және сызықтық емес теңсіздіктер жүйесі', NULL, NULL),
  ('math', 'inequality-systems', 3, 'exp-log-inequality-systems', 'Системы показательных и логарифмических неравенств', 'Көрсеткіштік және логарифмдік теңсіздіктер жүйесі', NULL, NULL),
  ('math', 'progressions', 1, 'arithmetic-progression', 'Арифметическая прогрессия', 'Арифметикалық прогрессия', NULL, NULL),
  ('math', 'progressions', 2, 'geometric-progression', 'Геометрическая прогрессия', 'Геометриялық прогрессия', NULL, NULL),
  ('math', 'progressions', 3, 'infinite-geometric', 'Бесконечно убывающая геометрическая прогрессия', 'Шексіз кемімелі геометриялық прогрессия', NULL, NULL),
  ('math', 'progressions', 4, 'progression-problems', 'Задачи на прогрессии', 'Прогрессияға берілген есептер', NULL, NULL),
  ('math', 'calculus-and-modeling', 1, 'functions-properties', 'Функция: область определения, свойства, графики', 'Функция: анықталу облысы, қасиеттері, графиктері', NULL, NULL),
  ('math', 'calculus-and-modeling', 2, 'derivative-rules', 'Производная: определение и правила дифференцирования', 'Туынды: анықтамасы және дифференциалдау ережелері', NULL, NULL),
  ('math', 'calculus-and-modeling', 3, 'derivative-applications', 'Касательная, монотонность и экстремумы функции', 'Жанама, функцияның монотондылығы және экстремумдары', NULL, NULL),
  ('math', 'calculus-and-modeling', 4, 'max-min-problems', 'Наибольшее и наименьшее значения, задачи на оптимизацию', 'Ең үлкен және ең кіші мәндер, оңтайландыру есептері', NULL, NULL),
  ('math', 'calculus-and-modeling', 5, 'antiderivative-integral', 'Первообразная и интеграл, площадь криволинейной трапеции', 'Алғашқы функция және интеграл, қисықсызықты трапецияның ауданы', NULL, NULL),
  ('math', 'calculus-and-modeling', 6, 'word-problems', 'Текстовые задачи: движение, работа, проценты, смеси', 'Мәтінді есептер: қозғалыс, жұмыс, пайыз, қоспалар', NULL, NULL),
  ('math', 'plane-figures', 1, 'lines-and-angles', 'Прямые и углы, параллельные прямые', 'Түзулер мен бұрыштар, параллель түзулер', NULL, NULL),
  ('math', 'plane-figures', 2, 'triangles', 'Треугольники: виды, признаки равенства и подобия', 'Үшбұрыштар: түрлері, теңдік және ұқсастық белгілері', NULL, NULL),
  ('math', 'plane-figures', 3, 'quadrilaterals', 'Четырёхугольники и многоугольники', 'Төртбұрыштар және көпбұрыштар', NULL, NULL),
  ('math', 'plane-figures', 4, 'circle', 'Окружность и круг, вписанные и описанные фигуры', 'Шеңбер және дөңгелек, іштей және сырттай сызылған фигуралар', NULL, NULL),
  ('math', 'metric-relations-plane', 1, 'triangle-metric', 'Теорема Пифагора, теоремы синусов и косинусов', 'Пифагор теоремасы, синустар және косинустар теоремалары', NULL, NULL),
  ('math', 'metric-relations-plane', 2, 'plane-areas', 'Площади плоских фигур', 'Жазық фигуралардың аудандары', NULL, NULL),
  ('math', 'metric-relations-plane', 3, 'plane-vectors', 'Векторы и координаты на плоскости', 'Жазықтықтағы векторлар мен координаттар', NULL, NULL),
  ('math', 'metric-relations-plane', 4, 'plane-transformations', 'Движения и преобразования плоскости', 'Жазықтықтағы қозғалыстар мен түрлендірулер', NULL, NULL),
  ('math', 'solid-figures', 1, 'space-lines-planes', 'Прямые и плоскости в пространстве', 'Кеңістіктегі түзулер мен жазықтықтар', NULL, NULL),
  ('math', 'solid-figures', 2, 'perpendicularity-angles', 'Перпендикулярность, углы и расстояния в пространстве', 'Кеңістіктегі перпендикулярлық, бұрыштар мен қашықтықтар', NULL, NULL),
  ('math', 'solid-figures', 3, 'polyhedra', 'Многогранники: призма, параллелепипед, пирамида', 'Көпжақтар: призма, параллелепипед, пирамида', NULL, NULL),
  ('math', 'solid-figures', 4, 'solids-of-revolution', 'Тела вращения: цилиндр, конус, шар', 'Айналу денелері: цилиндр, конус, шар', NULL, NULL),
  ('math', 'metric-relations-space', 1, 'polyhedra-area-volume', 'Площади поверхностей и объёмы многогранников', 'Көпжақтардың бет аудандары мен көлемдері', NULL, NULL),
  ('math', 'metric-relations-space', 2, 'revolution-area-volume', 'Площади поверхностей и объёмы тел вращения', 'Айналу денелерінің бет аудандары мен көлемдері', NULL, NULL),
  ('math', 'metric-relations-space', 3, 'combined-solids', 'Комбинации тел и сечения', 'Денелер комбинациясы және қималар', NULL, NULL),
  ('math', 'vectors-in-space', 1, 'space-coordinates', 'Прямоугольная система координат в пространстве', 'Кеңістіктегі тікбұрышты координаттар жүйесі', NULL, NULL),
  ('math', 'vectors-in-space', 2, 'space-vectors', 'Векторы в пространстве, скалярное произведение', 'Кеңістіктегі векторлар, скаляр көбейтінді', NULL, NULL),
  ('math', 'vectors-in-space', 3, 'space-transformations', 'Симметрия и движения в пространстве', 'Кеңістіктегі симметрия және қозғалыстар', NULL, NULL),
  ('physics', 'kinematics', 1, 'kinematics-basics', 'Основные понятия: система отсчёта, путь, перемещение', 'Негізгі ұғымдар: санақ жүйесі, жол, орын ауыстыру', NULL, NULL),
  ('physics', 'kinematics', 2, 'uniform-motion', 'Равномерное движение, относительность движения', 'Бірқалыпты қозғалыс, қозғалыстың салыстырмалылығы', NULL, NULL),
  ('physics', 'kinematics', 3, 'accelerated-motion', 'Равноускоренное движение', 'Бірқалыпты үдемелі қозғалыс', NULL, NULL),
  ('physics', 'kinematics', 4, 'free-fall-projectile', 'Свободное падение и движение тела, брошенного под углом', 'Еркін түсу және горизонтқа бұрыш жасай лақтырылған дененің қозғалысы', NULL, NULL),
  ('physics', 'kinematics', 5, 'circular-motion', 'Движение по окружности', 'Шеңбер бойымен қозғалыс', NULL, NULL),
  ('physics', 'dynamics', 1, 'newton-laws', 'Законы Ньютона', 'Ньютон заңдары', '{"pages":[{"kicker":"Основные понятия","title":"Что такое сила","blocks":[{"type":"list","items":["**Динамика** объясняет, почему тело движется именно так. Причина — силы.","**Сила** $\\vec F$ — мера действия одного тела на другое. Это вектор. Единица — **Н** (ньютон).","**Масса** $m$ — мера инертности тела, **кг**. Чем больше масса, тем труднее изменить скорость.","**Равнодействующая** — векторная сумма всех сил, приложенных к телу."]},{"type":"note","text":"Частые силы в задачах: $m\\vec g$ — тяжести, $\\vec N$ — реакции опоры, $\\vec F_{\\text{тр}}$ — трения, $\\vec T$ — натяжения."}]},{"kicker":"1-й закон · инерция","title":"Тело сохраняет скорость","blocks":[{"type":"text","text":"Если на тело не действуют силы или их равнодействующая равна нулю, тело **покоится** или движется **равномерно и прямолинейно**."},{"type":"list","items":["Закон выполняется в **инерциальных** системах отсчёта: они покоятся или движутся с $v = const$.","Тормозящий автобус — **неинерциальная** система. Пассажиров «бросает» вперёд, потому что они продолжают двигаться по инерции.","Книга на столе: силы есть, но $\\vec N + m\\vec g = 0$, поэтому она покоится."]}]},{"kicker":"2-й закон","title":"Сила = масса × ускорение","blocks":[{"type":"formula","tex":"\\vec F_{\\text{рез}} = m\\vec a \\qquad a = \\frac{F}{m}"},{"type":"list","items":["Ускорение направлено **так же, как равнодействующая**.","$1\\ \\text{Н} = 1\\ \\text{кг} \\cdot \\text{м}/\\text{с}^2$.","Сначала найди равнодействующую, потом дели на массу. Противоположные силы вычитаются."]},{"type":"note","text":"Пример: $10\\ \\text{Н}$ вправо и $4\\ \\text{Н}$ влево на тело $2\\ \\text{кг}$ → $F = 6\\ \\text{Н}$, $a = 3\\ \\text{м}/\\text{с}^2$."}]},{"kicker":"3-й закон","title":"Действие равно противодействию","blocks":[{"type":"formula","tex":"\\vec F_{12} = -\\vec F_{21}"},{"type":"list","items":["Равны по модулю.","Противоположны по направлению.","Одной природы.","**Приложены к разным телам** — поэтому не уравновешивают друг друга."],"ordered":true},{"type":"note","text":"Ракета отталкивает газ назад, газ толкает ракету вперёд. Земля притягивает яблоко с той же силой, что яблоко Землю."}]},{"kicker":"Ловушки ЕНТ","title":"Где чаще всего ошибаются","blocks":[{"type":"trap","items":["$v = const$ → $a = 0$ → $F_{\\text{рез}} = 0$. Не умножай массу на скорость!","Скорость в км/ч переводи в м/с: дели на 3,6.","Если сил несколько, во 2-й закон подставляй **равнодействующую**, а не одну силу.","«Кто сильнее давит при столкновении?» — силы **равны**, отличаются только ускорения.","Задачи «во сколько раз»: подставь множители, $a_2 = \\frac{3F}{2m} = 1{,}5\\,a_1$."]}]},{"kicker":"Проверь себя","title":"Ответь без подсказок","blocks":[{"type":"list","items":["Почему силы из 3-го закона не уравновешивают друг друга?","Силу увеличили в 3 раза, массу — в 2. Как изменилось ускорение?","Тело едет с постоянной скоростью. Чему равна равнодействующая?","Что является мерой инертности тела?"],"ordered":true},{"type":"note","text":"Ответы: разные тела · в 1,5 раза больше · нулю · масса."}]}]}'::jsonb, '{"pages":[{"kicker":"Негізгі ұғымдар","title":"Күш дегеніміз не","blocks":[{"type":"list","items":["**Динамика** дененің неліктен дәл осылай қозғалатынын түсіндіреді. Себебі — күштер.","**Күш** $\\vec F$ — бір дененің екінші денеге әсерінің өлшемі. Векторлық шама. Бірлігі — **Н** (ньютон).","**Масса** $m$ — дененің инерттілігінің өлшемі, **кг**. Масса неғұрлым үлкен болса, жылдамдықты өзгерту соғұрлым қиын.","**Тең әсерлі күш** — денеге түсірілген барлық күштердің векторлық қосындысы."]},{"type":"note","text":"Есептерде жиі кездесетін күштер: $m\\vec g$ — ауырлық, $\\vec N$ — тіректің реакциясы, $\\vec F_{\\text{үйк}}$ — үйкеліс, $\\vec T$ — керілу."}]},{"kicker":"1-заң · инерция","title":"Дене жылдамдығын сақтайды","blocks":[{"type":"text","text":"Егер денеге күштер әсер етпесе немесе олардың тең әсерлісі нөлге тең болса, дене **тыныштықта** болады немесе **бірқалыпты түзусызықты** қозғалады."},{"type":"list","items":["Заң **инерциялық** санақ жүйелерінде орындалады: олар тыныштықта тұрады немесе $v = const$ жылдамдықпен қозғалады.","Тежелген автобус — **инерциялық емес** жүйе. Жолаушылар инерциямен қозғалысын жалғастырғандықтан алға «лақтырылады».","Үстелдегі кітап: күштер бар, бірақ $\\vec N + m\\vec g = 0$, сондықтан ол тыныштықта."]}]},{"kicker":"2-заң","title":"Күш = масса × үдеу","blocks":[{"type":"formula","tex":"\\vec F_{\\text{т.ә}} = m\\vec a \\qquad a = \\frac{F}{m}"},{"type":"list","items":["Үдеу **тең әсерлі күшпен бағыттас**.","$1\\ \\text{Н} = 1\\ \\text{кг} \\cdot \\text{м}/\\text{с}^2$.","Алдымен тең әсерлі күшті тап, сосын массаға бөл. Қарама-қарсы күштер азайтылады."]},{"type":"note","text":"Мысал: $2\\ \\text{кг}$ денеге оңға $10\\ \\text{Н}$, солға $4\\ \\text{Н}$ → $F = 6\\ \\text{Н}$, $a = 3\\ \\text{м}/\\text{с}^2$."}]},{"kicker":"3-заң","title":"Әсер қарсы әсерге тең","blocks":[{"type":"formula","tex":"\\vec F_{12} = -\\vec F_{21}"},{"type":"list","items":["Модульдері тең.","Бағыттары қарама-қарсы.","Табиғаты бірдей.","**Әртүрлі денелерге түсірілген** — сондықтан бірін-бірі теңгермейді."],"ordered":true},{"type":"note","text":"Зымыран газды артқа итереді, газ зымыранды алға итереді. Жер алманы қандай күшпен тартса, алма Жерді сондай күшпен тартады."}]},{"kicker":"ҰБТ тұзақтары","title":"Жиі қателесетін жерлер","blocks":[{"type":"trap","items":["$v = const$ → $a = 0$ → $F_{\\text{т.ә}} = 0$. Массаны жылдамдыққа көбейтпе!","км/сағ-ты м/с-қа аудар: 3,6-ға бөл.","Күштер бірнешеу болса, 2-заңға **тең әсерлі күшті** қой.","«Соқтығысқанда қайсысы күштірек итереді?» — күштер **тең**, тек үдеулері әртүрлі.","«Неше есе» есептері: көбейткіштерді қой, $a_2 = \\frac{3F}{2m} = 1{,}5\\,a_1$."]}]},{"kicker":"Өзіңді тексер","title":"Көмексіз жауап бер","blocks":[{"type":"list","items":["3-заңдағы күштер неге бірін-бірі теңгермейді?","Күшті 3 есе, массаны 2 есе арттырды. Үдеу қалай өзгерді?","Дене тұрақты жылдамдықпен қозғалады. Тең әсерлі күш неге тең?","Дененің инерттілігінің өлшемі не?"],"ordered":true},{"type":"note","text":"Жауаптары: әртүрлі денелер · 1,5 есе артты · нөлге · масса."}]}]}'::jsonb),
  ('physics', 'dynamics', 2, 'forces-in-mechanics', 'Силы в механике: тяжести, упругости, трения', 'Механикадағы күштер: ауырлық, серпімділік, үйкеліс', NULL, NULL),
  ('physics', 'dynamics', 3, 'gravitation', 'Закон всемирного тяготения, вес, невесомость', 'Бүкіләлемдік тартылыс заңы, салмақ, салмақсыздық', NULL, NULL),
  ('physics', 'dynamics', 4, 'dynamics-problems', 'Движение связанных тел, наклонная плоскость', 'Байланысқан денелердің қозғалысы, көлбеу жазықтық', NULL, NULL),
  ('physics', 'statics', 1, 'equilibrium-moments', 'Условия равновесия, момент силы', 'Тепе-теңдік шарттары, күш моменті', NULL, NULL),
  ('physics', 'statics', 2, 'simple-machines', 'Простые механизмы, КПД, центр тяжести', 'Қарапайым механизмдер, ПӘК, ауырлық центрі', NULL, NULL),
  ('physics', 'conservation-laws', 1, 'momentum', 'Импульс и закон сохранения импульса', 'Импульс және импульстің сақталу заңы', NULL, NULL),
  ('physics', 'conservation-laws', 2, 'work-power', 'Механическая работа и мощность', 'Механикалық жұмыс және қуат', NULL, NULL),
  ('physics', 'conservation-laws', 3, 'energy-conservation', 'Энергия и закон сохранения энергии', 'Энергия және энергияның сақталу заңы', NULL, NULL),
  ('physics', 'conservation-laws', 4, 'collisions', 'Упругие и неупругие столкновения', 'Серпімді және серпімсіз соқтығысулар', NULL, NULL),
  ('physics', 'fluid-gas-mechanics', 1, 'pressure-pascal', 'Давление, закон Паскаля, гидростатика', 'Қысым, Паскаль заңы, гидростатика', NULL, NULL),
  ('physics', 'fluid-gas-mechanics', 2, 'archimedes', 'Закон Архимеда, плавание тел', 'Архимед заңы, денелердің жүзуі', NULL, NULL),
  ('physics', 'fluid-gas-mechanics', 3, 'fluid-flow', 'Движение жидкостей: уравнение неразрывности, закон Бернулли', 'Сұйықтардың қозғалысы: үзіліссіздік теңдеуі, Бернулли заңы', NULL, NULL),
  ('physics', 'kinetic-theory', 1, 'mkt-basics', 'Основы МКТ: количество вещества, моль, масса молекул', 'МКТ негіздері: зат мөлшері, моль, молекула массасы', NULL, NULL),
  ('physics', 'kinetic-theory', 2, 'mkt-equation', 'Основное уравнение МКТ, температура', 'МКТ-ның негізгі теңдеуі, температура', NULL, NULL),
  ('physics', 'gas-laws', 1, 'ideal-gas-equation', 'Уравнение состояния идеального газа', 'Идеал газ күйінің теңдеуі', NULL, NULL),
  ('physics', 'gas-laws', 2, 'isoprocesses', 'Изопроцессы и их графики', 'Изопроцестер және олардың графиктері', NULL, NULL),
  ('physics', 'thermodynamics', 1, 'internal-energy-heat', 'Внутренняя энергия, количество теплоты, теплоёмкость', 'Ішкі энергия, жылу мөлшері, жылусыйымдылық', NULL, NULL),
  ('physics', 'thermodynamics', 2, 'first-law', 'Первый закон термодинамики, работа газа', 'Термодинамиканың бірінші заңы, газдың жұмысы', NULL, NULL),
  ('physics', 'thermodynamics', 3, 'heat-engines', 'Тепловые двигатели, КПД, второй закон термодинамики', 'Жылу қозғалтқыштары, ПӘК, термодинамиканың екінші заңы', NULL, NULL),
  ('physics', 'thermodynamics', 4, 'phase-transitions', 'Плавление, парообразование, уравнение теплового баланса', 'Балқу, булану, жылулық баланс теңдеуі', NULL, NULL),
  ('physics', 'liquids-and-solids', 1, 'humidity-vapor', 'Насыщенный пар, влажность воздуха', 'Қаныққан бу, ауаның ылғалдылығы', NULL, NULL),
  ('physics', 'liquids-and-solids', 2, 'surface-tension', 'Поверхностное натяжение, капиллярность', 'Беттік керілу, капиллярлық', NULL, NULL),
  ('physics', 'liquids-and-solids', 3, 'solids-deformation', 'Твёрдые тела, деформация, закон Гука', 'Қатты денелер, деформация, Гук заңы', NULL, NULL),
  ('physics', 'electrostatics', 1, 'coulomb-law', 'Электрический заряд, закон Кулона', 'Электр заряды, Кулон заңы', NULL, NULL),
  ('physics', 'electrostatics', 2, 'electric-field', 'Электрическое поле, напряжённость', 'Электр өрісі, өріс кернеулігі', NULL, NULL),
  ('physics', 'electrostatics', 3, 'potential-work', 'Потенциал, разность потенциалов, работа поля', 'Потенциал, потенциалдар айырымы, өрістің жұмысы', NULL, NULL),
  ('physics', 'electrostatics', 4, 'capacitors', 'Электроёмкость, конденсаторы, энергия поля', 'Электр сыйымдылығы, конденсаторлар, өріс энергиясы', NULL, NULL),
  ('physics', 'direct-current', 1, 'ohm-law', 'Сила тока, сопротивление, закон Ома для участка цепи', 'Ток күші, кедергі, тізбек бөлігі үшін Ом заңы', NULL, NULL),
  ('physics', 'direct-current', 2, 'circuits', 'Последовательное и параллельное соединение', 'Тізбектей және параллель жалғау', NULL, NULL),
  ('physics', 'direct-current', 3, 'emf-full-circuit', 'ЭДС, закон Ома для полной цепи', 'ЭҚК, толық тізбек үшін Ом заңы', NULL, NULL),
  ('physics', 'direct-current', 4, 'joule-power', 'Работа и мощность тока, закон Джоуля–Ленца', 'Токтың жұмысы мен қуаты, Джоуль–Ленц заңы', NULL, NULL),
  ('physics', 'current-in-media', 1, 'current-metals-electrolytes', 'Ток в металлах и электролитах, электролиз', 'Металдардағы және электролиттердегі ток, электролиз', NULL, NULL),
  ('physics', 'current-in-media', 2, 'current-gases-vacuum', 'Ток в газах и вакууме', 'Газдардағы және вакуумдағы ток', NULL, NULL),
  ('physics', 'current-in-media', 3, 'semiconductors', 'Полупроводники, p–n-переход', 'Жартылай өткізгіштер, p–n ауысу', NULL, NULL),
  ('physics', 'magnetic-field', 1, 'magnetic-induction', 'Магнитное поле, индукция, сила Ампера', 'Магнит өрісі, магнит индукциясы, Ампер күші', NULL, NULL),
  ('physics', 'magnetic-field', 2, 'lorentz-force', 'Сила Лоренца, движение заряда в магнитном поле', 'Лоренц күші, магнит өрісіндегі зарядтың қозғалысы', NULL, NULL),
  ('physics', 'magnetic-field', 3, 'magnetic-properties', 'Магнитные свойства вещества', 'Заттың магниттік қасиеттері', NULL, NULL),
  ('physics', 'electromagnetic-induction', 1, 'faraday-lenz', 'Магнитный поток, закон Фарадея, правило Ленца', 'Магнит ағыны, Фарадей заңы, Ленц ережесі', NULL, NULL),
  ('physics', 'electromagnetic-induction', 2, 'self-induction', 'Самоиндукция, индуктивность, энергия магнитного поля', 'Өздік индукция, индуктивтілік, магнит өрісінің энергиясы', NULL, NULL),
  ('physics', 'mechanical-oscillations', 1, 'harmonic-oscillations', 'Гармонические колебания: амплитуда, период, частота', 'Гармоникалық тербелістер: амплитуда, период, жиілік', NULL, NULL),
  ('physics', 'mechanical-oscillations', 2, 'pendulums', 'Математический и пружинный маятники', 'Математикалық және серіппелі маятниктер', NULL, NULL),
  ('physics', 'mechanical-oscillations', 3, 'resonance', 'Энергия колебаний, вынужденные колебания, резонанс', 'Тербеліс энергиясы, еріксіз тербелістер, резонанс', NULL, NULL),
  ('physics', 'em-oscillations-ac', 1, 'lc-circuit', 'Колебательный контур, формула Томсона', 'Тербелмелі контур, Томсон формуласы', NULL, NULL),
  ('physics', 'em-oscillations-ac', 2, 'alternating-current', 'Переменный ток, действующие значения', 'Айнымалы ток, әсерлік мәндер', NULL, NULL),
  ('physics', 'em-oscillations-ac', 3, 'transformer', 'Трансформатор, передача электроэнергии', 'Трансформатор, электр энергиясын беру', NULL, NULL),
  ('physics', 'wave-motion', 1, 'mechanical-waves', 'Механические волны: длина волны, скорость', 'Механикалық толқындар: толқын ұзындығы, жылдамдық', NULL, NULL),
  ('physics', 'wave-motion', 2, 'sound', 'Звук и его характеристики', 'Дыбыс және оның сипаттамалары', NULL, NULL),
  ('physics', 'electromagnetic-waves', 1, 'em-waves', 'Электромагнитные волны и их свойства', 'Электромагниттік толқындар және олардың қасиеттері', NULL, NULL),
  ('physics', 'electromagnetic-waves', 2, 'em-spectrum-radio', 'Шкала электромагнитных волн, радиосвязь', 'Электромагниттік толқындар шкаласы, радиобайланыс', NULL, NULL),
  ('physics', 'wave-optics', 1, 'interference', 'Интерференция света', 'Жарық интерференциясы', NULL, NULL),
  ('physics', 'wave-optics', 2, 'diffraction-grating', 'Дифракция, дифракционная решётка', 'Дифракция, дифракциялық тор', NULL, NULL),
  ('physics', 'wave-optics', 3, 'dispersion-polarization', 'Дисперсия и поляризация света', 'Жарық дисперсиясы және поляризациясы', NULL, NULL),
  ('physics', 'geometric-optics', 1, 'reflection', 'Законы отражения, зеркала', 'Шағылу заңдары, айналар', NULL, NULL),
  ('physics', 'geometric-optics', 2, 'refraction', 'Преломление света, полное внутреннее отражение', 'Жарықтың сынуы, толық ішкі шағылу', NULL, NULL),
  ('physics', 'geometric-optics', 3, 'lenses', 'Линзы, формула тонкой линзы, оптические приборы', 'Линзалар, жұқа линза формуласы, оптикалық аспаптар', NULL, NULL),
  ('physics', 'relativity', 1, 'sr-postulates', 'Постулаты СТО, относительность времени и длины', 'АСТ постулаттары, уақыт пен ұзындықтың салыстырмалылығы', NULL, NULL),
  ('physics', 'relativity', 2, 'mass-energy', 'Связь массы и энергии', 'Масса мен энергияның байланысы', NULL, NULL),
  ('physics', 'atomic-and-quantum-physics', 1, 'photoeffect', 'Фотоэффект, уравнение Эйнштейна', 'Фотоэффект, Эйнштейн теңдеуі', NULL, NULL),
  ('physics', 'atomic-and-quantum-physics', 2, 'photons', 'Фотоны, давление света', 'Фотондар, жарық қысымы', NULL, NULL),
  ('physics', 'atomic-and-quantum-physics', 3, 'atom-bohr', 'Строение атома, постулаты Бора, спектры', 'Атом құрылысы, Бор постулаттары, спектрлер', NULL, NULL),
  ('physics', 'atomic-and-quantum-physics', 4, 'lasers', 'Лазеры', 'Лазерлер', NULL, NULL),
  ('physics', 'nuclear-physics', 1, 'nucleus-structure', 'Состав ядра, энергия связи, дефект масс', 'Ядро құрамы, байланыс энергиясы, масса ақауы', NULL, NULL),
  ('physics', 'nuclear-physics', 2, 'radioactivity', 'Радиоактивность, закон радиоактивного распада', 'Радиоактивтілік, радиоактивті ыдырау заңы', NULL, NULL),
  ('physics', 'nuclear-physics', 3, 'nuclear-reactions', 'Ядерные реакции, деление и синтез ядер', 'Ядролық реакциялар, ядролардың бөлінуі және синтезі', NULL, NULL),
  ('physics', 'nanotechnology', 1, 'nanomaterials', 'Наноматериалы и их свойства', 'Наноматериалдар және олардың қасиеттері', NULL, NULL),
  ('physics', 'nanotechnology', 2, 'nanotech-applications', 'Применение нанотехнологий', 'Нанотехнологияларды қолдану', NULL, NULL),
  ('physics', 'cosmology', 1, 'solar-system', 'Солнечная система, законы Кеплера', 'Күн жүйесі, Кеплер заңдары', NULL, NULL),
  ('physics', 'cosmology', 2, 'stars-galaxies', 'Звёзды и галактики', 'Жұлдыздар мен галактикалар', NULL, NULL),
  ('physics', 'cosmology', 3, 'universe-evolution', 'Эволюция Вселенной, закон Хаббла', 'Әлемнің эволюциясы, Хаббл заңы', NULL, NULL),
  ('informatics', 'computer-devices', 1, 'computer-architecture', 'Архитектура компьютера: процессор и память', 'Компьютер архитектурасы: процессор және жад', NULL, NULL),
  ('informatics', 'computer-devices', 2, 'io-devices', 'Устройства ввода и вывода', 'Енгізу және шығару құрылғылары', NULL, NULL),
  ('informatics', 'networks-and-security', 1, 'network-basics', 'Компьютерные сети: виды и топологии', 'Компьютерлік желілер: түрлері мен топологиялары', NULL, NULL),
  ('informatics', 'networks-and-security', 2, 'ip-addressing', 'IP-адресация, маска сети, протоколы', 'IP-адрестеу, желі маскасы, хаттамалар', NULL, NULL),
  ('informatics', 'networks-and-security', 3, 'info-security', 'Информационная безопасность', 'Ақпараттық қауіпсіздік', NULL, NULL),
  ('informatics', 'information-representation', 1, 'information-measurement', 'Измерение информации, единицы измерения', 'Ақпаратты өлшеу, өлшем бірліктері', NULL, NULL),
  ('informatics', 'information-representation', 2, 'text-encoding', 'Кодирование текстовой информации', 'Мәтіндік ақпаратты кодтау', NULL, NULL),
  ('informatics', 'information-representation', 3, 'image-sound-encoding', 'Кодирование изображений и звука', 'Кескін мен дыбысты кодтау', NULL, NULL),
  ('informatics', 'number-systems', 1, 'positional-systems', 'Позиционные системы счисления, перевод чисел', 'Позициялық санау жүйелері, сандарды аудару', NULL, NULL),
  ('informatics', 'number-systems', 2, 'base-arithmetic', 'Арифметика в двоичной, восьмеричной и шестнадцатеричной системах', 'Екілік, сегіздік және он алтылық жүйелердегі арифметика', NULL, NULL),
  ('informatics', 'logic-foundations', 1, 'logic-operations', 'Логические операции и таблицы истинности', 'Логикалық амалдар және ақиқат кестелері', NULL, NULL),
  ('informatics', 'logic-foundations', 2, 'logic-laws', 'Законы алгебры логики, упрощение выражений', 'Логика алгебрасының заңдары, өрнектерді ықшамдау', NULL, NULL),
  ('informatics', 'logic-foundations', 3, 'logic-gates', 'Логические элементы и схемы', 'Логикалық элементтер мен сұлбалар', NULL, NULL),
  ('informatics', 'python-programming', 1, 'python-basics', 'Python: переменные, типы данных, ввод и вывод', 'Python: айнымалылар, деректер типтері, енгізу және шығару', NULL, NULL),
  ('informatics', 'python-programming', 2, 'python-branching', 'Python: условия и ветвление', 'Python: шарттар және тармақталу', NULL, NULL),
  ('informatics', 'python-programming', 3, 'python-loops', 'Python: циклы for и while', 'Python: for және while циклдері', NULL, NULL),
  ('informatics', 'python-programming', 4, 'python-lists', 'Python: списки', 'Python: тізімдер', NULL, NULL),
  ('informatics', 'algorithms-and-programs', 1, 'functions-recursion', 'Функции и рекурсия', 'Функциялар және рекурсия', NULL, NULL),
  ('informatics', 'algorithms-and-programs', 2, 'strings', 'Работа со строками', 'Жолдармен жұмыс', NULL, NULL),
  ('informatics', 'algorithms-and-programs', 3, 'files', 'Работа с файлами', 'Файлдармен жұмыс', NULL, NULL),
  ('informatics', 'algorithms-and-programs', 4, 'sorting-searching', 'Сортировка и поиск', 'Сұрыптау және іздеу', NULL, NULL),
  ('informatics', 'algorithms-and-programs', 5, 'graphs', 'Графы и алгоритмы на графах', 'Графтар және графтардағы алгоритмдер', NULL, NULL),
  ('informatics', 'hardware-and-software', 1, 'software-types', 'Виды программного обеспечения, операционные системы', 'Бағдарламалық қамтамасыз ету түрлері, операциялық жүйелер', NULL, NULL),
  ('informatics', 'hardware-and-software', 2, 'file-systems', 'Файлы и файловые системы', 'Файлдар және файлдық жүйелер', NULL, NULL),
  ('informatics', 'relational-databases', 1, 'db-concepts', 'Реляционная модель: таблицы, ключи, связи', 'Реляциялық модель: кестелер, кілттер, байланыстар', NULL, NULL),
  ('informatics', 'relational-databases', 2, 'normalization', 'Нормализация баз данных', 'Деректер қорын қалыпқа келтіру', NULL, NULL),
  ('informatics', 'database-design-sql', 1, 'sql-select', 'SQL: SELECT, WHERE, ORDER BY', 'SQL: SELECT, WHERE, ORDER BY', NULL, NULL),
  ('informatics', 'database-design-sql', 2, 'sql-join-aggregate', 'SQL: агрегатные функции и JOIN', 'SQL: агрегаттық функциялар және JOIN', NULL, NULL),
  ('informatics', 'database-design-sql', 3, 'sql-modify', 'SQL: создание и изменение таблиц', 'SQL: кестелерді құру және өзгерту', NULL, NULL),
  ('informatics', 'it-trends-and-3d', 1, 'it-trends', 'Современные IT-тенденции, IT-стартапы', 'Заманауи IT-үрдістер, IT-стартаптар', NULL, NULL),
  ('informatics', 'it-trends-and-3d', 2, 'modeling-3d', '3D-моделирование', '3D-модельдеу', NULL, NULL),
  ('informatics', 'information-objects', 1, 'documents-spreadsheets', 'Текстовые документы и электронные таблицы', 'Мәтіндік құжаттар және электрондық кестелер', NULL, NULL),
  ('informatics', 'information-objects', 2, 'graphics-multimedia', 'Графика и мультимедиа', 'Графика және мультимедиа', NULL, NULL),
  ('informatics', 'web-design', 1, 'html-css', 'HTML и CSS', 'HTML және CSS', NULL, NULL),
  ('informatics', 'web-design', 2, 'web-design-principles', 'Принципы веб-дизайна, структура сайта', 'Веб-дизайн принциптері, сайт құрылымы', NULL, NULL)
) AS v(subject_slug, topic_slug, sort_order, slug, name_ru, name_kk, content_ru, content_kk)
JOIN public.subjects s ON s.slug = v.subject_slug
JOIN public.topics t ON t.subject_id = s.id AND t.slug = v.topic_slug
ON CONFLICT (slug) DO NOTHING;
