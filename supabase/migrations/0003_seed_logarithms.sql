-- =====================================================
-- Seed: задачи по теме «Логарифмы»
-- Переписаны на основе пробника НЦТ — другие числа/условия,
-- математическая сложность сохранена.
-- =====================================================

-- 1. Single-choice: ln²x − 3lnx = 0
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 2,
  $json${
    "stem": "Найдите корни уравнения $\\ln^2 x - 3\\ln x = 0$",
    "options": [
      {"id": "A", "content": "$e^3$; $3$"},
      {"id": "B", "content": "$e^3$; $1$"},
      {"id": "C", "content": "$e^2$; $1$"},
      {"id": "D", "content": "$e$; $1$"}
    ],
    "correct": "B"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "Сделаем замену $t = \\ln x$, получим квадратное уравнение $t^2 - 3t = 0$."},
    {"type": "text", "value": "Вынесем $t$ за скобку: $t(t - 3) = 0$. Корни: $t = 0$ или $t = 3$."},
    {"type": "text", "value": "Возвращаемся к $x$: при $\\ln x = 0$ получаем $x = 1$; при $\\ln x = 3$ получаем $x = e^3$."}
  ]}$json$::jsonb,
  true, 1
FROM public.topics t WHERE t.slug = 'logarithms';

-- 2. Single-choice: log₂ 8 + log₃ 9
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 1,
  $json${
    "stem": "Вычислите $\\log_2 8 + \\log_3 9$",
    "options": [
      {"id": "A", "content": "$6$"},
      {"id": "B", "content": "$5$"},
      {"id": "C", "content": "$4$"},
      {"id": "D", "content": "$7$"}
    ],
    "correct": "B"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "$\\log_2 8 = \\log_2 2^3 = 3$, поскольку $2^3 = 8$."},
    {"type": "text", "value": "$\\log_3 9 = \\log_3 3^2 = 2$, поскольку $3^2 = 9$."},
    {"type": "text", "value": "Сумма: $3 + 2 = 5$."}
  ]}$json$::jsonb,
  true, 2
FROM public.topics t WHERE t.slug = 'logarithms';

-- 3. Single-choice: log₂ 32 − log₂ 4
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 1,
  $json${
    "stem": "Упростите выражение $\\log_2 32 - \\log_2 4$",
    "options": [
      {"id": "A", "content": "$2$"},
      {"id": "B", "content": "$3$"},
      {"id": "C", "content": "$4$"},
      {"id": "D", "content": "$5$"}
    ],
    "correct": "B"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "По свойству логарифмов разность можно записать как логарифм частного: $\\log_2 32 - \\log_2 4 = \\log_2 \\frac{32}{4} = \\log_2 8$."},
    {"type": "text", "value": "Поскольку $2^3 = 8$, получаем $\\log_2 8 = 3$."}
  ]}$json$::jsonb,
  true, 3
FROM public.topics t WHERE t.slug = 'logarithms';

-- 4. Single-choice: область определения y = log₅(x − 2)
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 2,
  $json${
    "stem": "Найдите область определения функции $y = \\log_5(x - 2)$",
    "options": [
      {"id": "A", "content": "$(2; +\\infty)$"},
      {"id": "B", "content": "$(-\\infty; 2)$"},
      {"id": "C", "content": "$[2; +\\infty)$"},
      {"id": "D", "content": "$(-\\infty; -2) \\cup (2; +\\infty)$"}
    ],
    "correct": "A"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "Логарифм определён только для положительных аргументов: $x - 2 > 0$, то есть $x > 2$."},
    {"type": "text", "value": "Значит область определения — открытый интервал $(2; +\\infty)$. Точка $x = 2$ не входит, поскольку $\\log_5 0$ не определён."}
  ]}$json$::jsonb,
  true, 4
FROM public.topics t WHERE t.slug = 'logarithms';

-- 5. Single-choice: log₂(x + 3) = 4
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'single', 2,
  $json${
    "stem": "Решите уравнение $\\log_2(x + 3) = 4$",
    "options": [
      {"id": "A", "content": "$11$"},
      {"id": "B", "content": "$13$"},
      {"id": "C", "content": "$16$"},
      {"id": "D", "content": "$19$"}
    ],
    "correct": "B"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "По определению логарифма: $\\log_2(x + 3) = 4 \\iff x + 3 = 2^4 = 16$."},
    {"type": "text", "value": "Отсюда $x = 16 - 3 = 13$. Проверка ОДЗ: $13 + 3 = 16 > 0$ — подходит."}
  ]}$json$::jsonb,
  true, 5
FROM public.topics t WHERE t.slug = 'logarithms';

-- 6. Multi-select: какие из равенств верны
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'multi', 3,
  $json${
    "stem": "Какие из равенств верны? Выберите все правильные варианты.",
    "options": [
      {"id": "A", "content": "$\\log_3 9 = 2$"},
      {"id": "B", "content": "$\\log_5 25 = 2$"},
      {"id": "C", "content": "$\\log_2 8 = 4$"},
      {"id": "D", "content": "$\\log_{10} 100 = 2$"},
      {"id": "E", "content": "$\\log_4 2 = 2$"},
      {"id": "F", "content": "$\\log_7 49 = 3$"}
    ],
    "correct": ["A", "B", "D"]
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "Проверяем каждое равенство: $\\log_3 9 = 2$ верно ($3^2 = 9$). $\\log_5 25 = 2$ верно ($5^2 = 25$). $\\log_2 8 = 3$, не $4$ — неверно. $\\log_{10} 100 = 2$ верно. $\\log_4 2 = 1/2$, не $2$ — неверно. $\\log_7 49 = 2$, не $3$ — неверно."},
    {"type": "text", "value": "Правильные: A, B, D."}
  ]}$json$::jsonb,
  true, 6
FROM public.topics t WHERE t.slug = 'logarithms';

-- 7. Matching: соответствие между логарифмом и значением
INSERT INTO public.questions (topic_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT t.id, 'ru', 'matching', 2,
  $json${
    "stem": "Установите соответствие между логарифмом и его значением.",
    "left": [
      {"id": "A", "content": "$\\log_2 16$"},
      {"id": "B", "content": "$\\log_3 9$"},
      {"id": "C", "content": "$\\log_5 125$"}
    ],
    "right": ["2", "3", "4", "5"],
    "correct": {"A": "4", "B": "2", "C": "3"}
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "$\\log_2 16 = 4$, поскольку $2^4 = 16$."},
    {"type": "text", "value": "$\\log_3 9 = 2$, поскольку $3^2 = 9$."},
    {"type": "text", "value": "$\\log_5 125 = 3$, поскольку $5^3 = 125$."}
  ]}$json$::jsonb,
  true, 7
FROM public.topics t WHERE t.slug = 'logarithms';

-- 8 + 9. Контекстный блок: pH раствора (2 подзадачи)
WITH ctx AS (
  INSERT INTO public.contexts (topic_id, language, title, content)
  SELECT t.id, 'ru', 'pH раствора',
    $json${"blocks": [
      {"type": "text", "value": "В лабораторных исследованиях для измерения кислотности раствора используется pH-шкала, определяемая формулой:"},
      {"type": "latex", "value": "pH = -\\log_{10}[H^+]"},
      {"type": "text", "value": "где [H⁺] — концентрация ионов водорода в моль/л. Чем меньше pH, тем кислее раствор."}
    ]}$json$::jsonb
  FROM public.topics t WHERE t.slug = 'logarithms'
  RETURNING id, topic_id
),
q8 AS (
  INSERT INTO public.questions (topic_id, context_id, language, type, difficulty, body, explanation, is_published, sort_order)
  SELECT ctx.topic_id, ctx.id, 'ru', 'single', 2,
    $json${
      "stem": "Раствор имеет концентрацию ионов водорода $[H^+] = 10^{-3}$ моль/л. Найдите pH раствора.",
      "options": [
        {"id": "A", "content": "$3$"},
        {"id": "B", "content": "$-3$"},
        {"id": "C", "content": "$10$"},
        {"id": "D", "content": "$\\frac{1}{3}$"}
      ],
      "correct": "A"
    }$json$::jsonb,
    $json${"blocks": [
      {"type": "text", "value": "Подставляем в формулу: $pH = -\\log_{10}(10^{-3}) = -(-3) = 3$."}
    ]}$json$::jsonb,
    true, 8
  FROM ctx
  RETURNING id
)
INSERT INTO public.questions (topic_id, context_id, language, type, difficulty, body, explanation, is_published, sort_order)
SELECT ctx.topic_id, ctx.id, 'ru', 'single', 2,
  $json${
    "stem": "Если pH раствора равен $5$, какова концентрация ионов водорода?",
    "options": [
      {"id": "A", "content": "$10^{-5}$ моль/л"},
      {"id": "B", "content": "$5$ моль/л"},
      {"id": "C", "content": "$-5$ моль/л"},
      {"id": "D", "content": "$10^5$ моль/л"}
    ],
    "correct": "A"
  }$json$::jsonb,
  $json${"blocks": [
    {"type": "text", "value": "Из формулы $pH = -\\log_{10}[H^+]$ выражаем $[H^+]$: $\\log_{10}[H^+] = -pH$, откуда $[H^+] = 10^{-pH}$."},
    {"type": "text", "value": "При $pH = 5$ получаем $[H^+] = 10^{-5}$ моль/л."}
  ]}$json$::jsonb,
  true, 9
FROM ctx;
