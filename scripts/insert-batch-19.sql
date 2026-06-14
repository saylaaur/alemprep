-- AlemPrep content batch
-- Generated:  2026-06-03T18:23:25.158Z
-- Source:     scripts/references/math-2026-06-03T17-55.json
-- Questions:  9
-- Apply in:   Supabase Studio › SQL Editor

BEGIN;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'derivatives'),
  NULL,
  'ru',
  'single',
  2,
  $alemprep${"stem":"Найдите неопределенный интеграл $\\int e^{7x} dx$","options":[{"id":"a","content":"$7e^{7x} + C$"},{"id":"b","content":"$e^{7x} + C$"},{"id":"c","content":"$\\frac{1}{7}e^{7x} + C$"},{"id":"d","content":"$7e^x + C$"}],"correct":"c"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Для нахождения неопределенного интеграла воспользуемся формулой интегрирования экспоненциальной функции:"},{"type":"latex","value":"$$\\int e^{ax} dx = \\frac{1}{a} e^{ax} + C$$"},{"type":"text","value":"В данном случае $a=7$. Подставляем значение $a$ в формулу:"},{"type":"latex","value":"$$\\int e^{7x} dx = \\frac{1}{7} e^{7x} + C$$"}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1001;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'derivatives'),
  NULL,
  'ru',
  'single',
  2,
  $alemprep${"stem":"Найдите неопределенный интеграл $\\int e^{3x} dx$","options":[{"id":"a","content":"$3e^{3x} + C$"},{"id":"b","content":"$e^{3x} + C$"},{"id":"c","content":"$\\frac{1}{3}e^{3x} + C$"},{"id":"d","content":"$3e^x + C$"}],"correct":"c"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Для нахождения неопределенного интеграла воспользуемся формулой интегрирования экспоненциальной функции:"},{"type":"latex","value":"$$\\int e^{ax} dx = \\frac{1}{a} e^{ax} + C$$"},{"type":"text","value":"В данном случае $a=3$. Подставляем значение $a$ в формулу:"},{"type":"latex","value":"$$\\int e^{3x} dx = \\frac{1}{3} e^{3x} + C$$"}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1002;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'derivatives'),
  NULL,
  'ru',
  'single',
  2,
  $alemprep${"stem":"Найдите неопределенный интеграл $\\int e^{-2x} dx$","options":[{"id":"a","content":"$-2e^{-2x} + C$"},{"id":"b","content":"$e^{-2x} + C$"},{"id":"c","content":"$-\\frac{1}{2}e^{-2x} + C$"},{"id":"d","content":"$-2e^x + C$"}],"correct":"c"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Для нахождения неопределенного интеграла воспользуемся формулой интегрирования экспоненциальной функции:"},{"type":"latex","value":"$$\\int e^{ax} dx = \\frac{1}{a} e^{ax} + C$$"},{"type":"text","value":"В данном случае $a=-2$. Подставляем значение $a$ в формулу:"},{"type":"latex","value":"$$\\int e^{-2x} dx = \\frac{1}{-2} e^{-2x} + C$$"},{"type":"text","value":"Что равно:"},{"type":"latex","value":"$$-\\frac{1}{2}e^{-2x} + C$$"}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1003;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'logarithms'),
  NULL,
  'ru',
  'single',
  3,
  $alemprep${"stem":"Найдите корни уравнения $\\log_3^2 x - 4\\log_3 x = 0$","options":[{"id":"a","content":"$1; 81$"},{"id":"b","content":"$81; 4$"},{"id":"c","content":"$3; 81$"},{"id":"d","content":"$1; 12$"}],"correct":"a"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Это логарифмическое уравнение. Введем замену переменной."},{"type":"latex","value":"\\log_3^2 x - 4\\log_3 x = 0"},{"type":"text","value":"Пусть $y = \\log_3 x$. Тогда уравнение примет вид:"},{"type":"latex","value":"y^2 - 4y = 0"},{"type":"text","value":"Вынесем $y$ за скобки:"},{"type":"latex","value":"y(y - 4) = 0"},{"type":"text","value":"Из этого следует, что либо $y=0$, либо $y-4=0$."},{"type":"latex","value":"y_1 = 0 \\quad \\text{или} \\quad y_2 = 4"},{"type":"text","value":"Теперь подставим обратно $\\log_3 x$ вместо $y$."},{"type":"latex","value":"\\log_3 x = 0"},{"type":"text","value":"По определению логарифма, $x = 3^0$, что равно 1."},{"type":"latex","value":"x_1 = 1"},{"type":"latex","value":"\\log_3 x = 4"},{"type":"text","value":"По определению логарифма, $x = 3^4$, что равно 81."},{"type":"latex","value":"x_2 = 81"},{"type":"text","value":"Оба корня $x=1$ и $x=81$ удовлетворяют условию $x > 0$ для логарифма. Таким образом, корни уравнения $1$ и $81$."}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1004;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'logarithms'),
  NULL,
  'ru',
  'single',
  3,
  $alemprep${"stem":"Найдите корни уравнения $\\log_5^2 x - 3\\log_5 x = 0$","options":[{"id":"a","content":"$5^3; 3$"},{"id":"b","content":"$1; 15$"},{"id":"c","content":"$1; 125$"},{"id":"d","content":"$5; 125$"}],"correct":"c"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Данное уравнение является логарифмическим. Введем замену переменной."},{"type":"latex","value":"\\log_5^2 x - 3\\log_5 x = 0"},{"type":"text","value":"Пусть $y = \\log_5 x$. Тогда уравнение примет вид:"},{"type":"latex","value":"y^2 - 3y = 0"},{"type":"text","value":"Вынесем $y$ за скобки:"},{"type":"latex","value":"y(y - 3) = 0"},{"type":"text","value":"Из этого следует, что либо $y=0$, либо $y-3=0$."},{"type":"latex","value":"y_1 = 0 \\quad \\text{или} \\quad y_2 = 3"},{"type":"text","value":"Теперь подставим обратно $\\log_5 x$ вместо $y$."},{"type":"latex","value":"\\log_5 x = 0"},{"type":"text","value":"По определению логарифма, $x = 5^0$, что равно 1."},{"type":"latex","value":"x_1 = 1"},{"type":"latex","value":"\\log_5 x = 3"},{"type":"text","value":"По определению логарифма, $x = 5^3$, что равно 125."},{"type":"latex","value":"x_2 = 125"},{"type":"text","value":"Оба корня $x=1$ и $x=125$ удовлетворяют условию $x > 0$ для логарифма. Таким образом, корни уравнения $1$ и $125$."}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1005;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'logarithms'),
  NULL,
  'ru',
  'single',
  3,
  $alemprep${"stem":"Найдите корни уравнения $\\log_2^2 x - 5\\log_2 x = 0$","options":[{"id":"a","content":"$1; 32$"},{"id":"b","content":"$2^5; 5$"},{"id":"c","content":"$2; 32$"},{"id":"d","content":"$1; 10$"}],"correct":"a"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Данное уравнение является логарифмическим. Введем замену переменной."},{"type":"latex","value":"\\log_2^2 x - 5\\log_2 x = 0"},{"type":"text","value":"Пусть $y = \\log_2 x$. Тогда уравнение примет вид:"},{"type":"latex","value":"y^2 - 5y = 0"},{"type":"text","value":"Вынесем $y$ за скобки:"},{"type":"latex","value":"y(y - 5) = 0"},{"type":"text","value":"Из этого следует, что либо $y=0$, либо $y-5=0$."},{"type":"latex","value":"y_1 = 0 \\quad \\text{или} \\quad y_2 = 5"},{"type":"text","value":"Теперь подставим обратно $\\log_2 x$ вместо $y$."},{"type":"latex","value":"\\log_2 x = 0"},{"type":"text","value":"По определению логарифма, $x = 2^0$, что равно 1."},{"type":"latex","value":"x_1 = 1"},{"type":"latex","value":"\\log_2 x = 5"},{"type":"text","value":"По определению логарифма, $x = 2^5$, что равно 32."},{"type":"latex","value":"x_2 = 32"},{"type":"text","value":"Оба корня $x=1$ и $x=32$ удовлетворяют условию $x > 0$ для логарифма. Таким образом, корни уравнения $1$ и $32$."}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1006;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'algebra'),
  NULL,
  'ru',
  'single',
  2,
  $alemprep${"stem":"Найдите область допустимых значений переменной $x$ в алгебраическом выражении $\\frac{7x}{x-5}$.","options":[{"id":"a","content":"$(-\\infty; 0) \\cup (0; +\\infty)$"},{"id":"b","content":"$(-\\infty; 5)$"},{"id":"c","content":"$(5; +\\infty)$"},{"id":"d","content":"$(-\\infty; 5) \\cup (5; +\\infty)$"}],"correct":"d"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Область допустимых значений (ОДЗ) для алгебраической дроби определяется условием, что знаменатель не должен быть равен нулю."},{"type":"latex","value":"x - 5 \\neq 0"},{"type":"latex","value":"x \\neq 5"},{"type":"text","value":"Таким образом, переменная $x$ может принимать любые действительные значения, кроме 5. Это можно записать в виде интервала:"},{"type":"latex","value":"$(-\\infty; 5) \\cup (5; +\\infty)$"}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1007;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'algebra'),
  NULL,
  'ru',
  'single',
  2,
  $alemprep${"stem":"Определите область допустимых значений переменной $b$ в выражении $\\frac{b^2+1}{b+3}$.","options":[{"id":"a","content":"$(-\\infty; 3) \\cup (3; +\\infty)$"},{"id":"b","content":"$(-\\infty; -3)$"},{"id":"c","content":"$(-\\infty; -3) \\cup (-3; +\\infty)$"},{"id":"d","content":"$(-3; +\\infty)$"}],"correct":"c"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Область допустимых значений (ОДЗ) для алгебраической дроби определяется условием, что знаменатель не должен быть равен нулю."},{"type":"latex","value":"b + 3 \\neq 0"},{"type":"latex","value":"b \\neq -3"},{"type":"text","value":"Таким образом, переменная $b$ может принимать любые действительные значения, кроме -3. Это можно записать в виде интервала:"},{"type":"latex","value":"$(-\\infty; -3) \\cup (-3; +\\infty)$"}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1008;

INSERT INTO public.questions
  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)
SELECT
  (SELECT t.id FROM public.topics t
   JOIN public.subjects s ON t.subject_id = s.id
   WHERE s.slug = 'math' AND t.slug = 'algebra'),
  NULL,
  'ru',
  'single',
  2,
  $alemprep${"stem":"Найдите ОДЗ переменной $k$ для выражения $\\frac{4k-1}{2k-6}$.","options":[{"id":"a","content":"$(-\\infty; 6) \\cup (6; +\\infty)$"},{"id":"b","content":"$(-\\infty; 3) \\cup (3; +\\infty)$"},{"id":"c","content":"$(-\\infty; 3)$"},{"id":"d","content":"$(3; +\\infty)$"}],"correct":"b"}$alemprep$::jsonb,
  $alemprep${"blocks":[{"type":"text","value":"Область допустимых значений (ОДЗ) для алгебраической дроби определяется условием, что знаменатель не должен быть равен нулю."},{"type":"latex","value":"2k - 6 \\neq 0"},{"type":"latex","value":"2k \\neq 6"},{"type":"latex","value":"k \\neq 3"},{"type":"text","value":"Таким образом, переменная $k$ может принимать любые действительные значения, кроме 3. Это можно записать в виде интервала:"},{"type":"latex","value":"$(-\\infty; 3) \\cup (3; +\\infty)$"}]}$alemprep$::jsonb,
  'ai_rewritten',
  false,
  1009;

COMMIT;
