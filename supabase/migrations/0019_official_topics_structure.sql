-- =====================================================
-- 0019: официальная структура тем НЦТ (Раздел → Тема) +
-- предмет «Математическая грамотность»
-- =====================================================
-- Темы раньше были придуманы «на глаз» по пробникам (26 штук). Официальные
-- спецификации НЦТ (testcenter.kz, для использования с 2026 года) задают
-- двухуровневую структуру (Раздел → Тема) и другой состав/количество тем.
-- Проект подаётся в управление образования — нужна прослеживаемая связь
-- с официальной программой.
--
-- Разделов десятки — отдельную таблицу sections не заводим (см. docs/AUDIT.md,
-- находка про нагрузку на БД): раздел хранится прямо на topics колонками
-- (section_no, section_name_ru, section_name_kk), повторяясь по темам раздела.
--
-- Источник: scripts/data/official-topics.json — извлечено из официальных PDF
-- спецификаций НЦТ, названия НЕ переписаны своими словами.
--
-- name_kk = NULL и у новых тем, и у предмета «Математическая грамотность»:
-- казахские формулировки берутся из официальных казахских версий спецификаций
-- (НЕ машинный перевод), появятся отдельным обновлением. name_kk у topics
-- и subjects поэтому становится NULLABLE (было NOT NULL).
--
-- ⚠️  Старые темы НЕ удаляются — на них висят ~1450 задач. Часть новых слагов
-- совпадает со старыми (trigonometry, electrostatics, thermodynamics,
-- number-systems, progressions) — для них ON CONFLICT ТОЛЬКО дополняет
-- section_no/section_name_ru/section_name_kk/topic_no; id/slug/name_ru/name_kk
-- существующей темы не трогаем.
-- =====================================================

-- 1. Двухуровневая структура (Раздел → Тема)
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS section_no INT,
  ADD COLUMN IF NOT EXISTS section_name_ru TEXT,
  ADD COLUMN IF NOT EXISTS section_name_kk TEXT,
  ADD COLUMN IF NOT EXISTS topic_no INT;

ALTER TABLE public.topics ALTER COLUMN name_kk DROP NOT NULL;
ALTER TABLE public.subjects ALTER COLUMN name_kk DROP NOT NULL;

-- 2. Новый предмет: «Математическая грамотность» (обязательный блок ЕНТ,
-- 10 заданий / 10 баллов — см. lib/exam.ts MATH_LITERACY_BLUEPRINT)
INSERT INTO public.subjects (slug, name_ru, name_kk, icon, is_active, sort_order)
VALUES ('math-literacy', 'Математическая грамотность', NULL, 'Brain', true, 4)
ON CONFLICT (slug) DO NOTHING;

-- 3. Официальные темы — math (18), physics (25), informatics (13),
-- math-literacy (10). sort_order = topic_no (внутрипредметный порядок;
-- окончательная группировка на странице предмета — по section_no/topic_no).
INSERT INTO public.topics (
  subject_id, slug, name_ru, name_kk,
  section_no, section_name_ru, section_name_kk, topic_no, sort_order
)
SELECT s.id, t.slug, t.name_ru, NULL, t.section_no, t.section_name_ru, NULL, t.topic_no, t.topic_no
FROM public.subjects s
CROSS JOIN (VALUES
  -- math: Математика (40 заданий, 50 баллов)
  ('math', 1, 'Числа', 1, 'radicals-and-expressions', 'Действия с радикалами. Числовые и буквенные выражения. Дробные и целые выражения'),
  ('math', 1, 'Числа', 2, 'powers', 'Действия со степенями'),
  ('math', 1, 'Числа', 3, 'trigonometry', 'Тригонометрия'),
  ('math', 1, 'Числа', 4, 'algebraic-expressions', 'Алгебраические выражения и их преобразования. Формулы сокращённого умножения. Степень дроби. Разложение многочлена. Упрощение алгебраических выражений'),
  ('math', 2, 'Уравнения', 5, 'linear-quadratic-rational-equations', 'Линейные уравнения. Квадратные уравнения. Дробно-рациональные уравнения'),
  ('math', 2, 'Уравнения', 6, 'trig-irrational-equations', 'Тригонометрические уравнения. Иррациональные уравнения'),
  ('math', 2, 'Уравнения', 7, 'exponential-log-equations', 'Показательные уравнения. Логарифмические уравнения'),
  ('math', 3, 'Системы уравнений', 8, 'linear-nonlinear-systems', 'Системы линейных уравнений с двумя переменными. Системы нелинейных уравнений с двумя переменными'),
  ('math', 3, 'Системы уравнений', 9, 'special-equation-systems', 'Системы тригонометрических, иррациональных, показательных и логарифмических уравнений'),
  ('math', 4, 'Неравенства', 10, 'inequalities', 'Линейные, квадратные и рациональные неравенства. Простейшие тригонометрические и иррациональные неравенства. Показательные и логарифмические неравенства'),
  ('math', 5, 'Системы неравенств', 11, 'inequality-systems', 'Система линейных неравенств. Система дробно-рациональных неравенств с одной переменной. Система нелинейных неравенств. Системы показательных и логарифмических неравенств'),
  ('math', 6, 'Последовательности', 12, 'progressions', 'Арифметическая и геометрическая прогрессии'),
  ('math', 7, 'Математическое моделирование и анализ', 13, 'calculus-and-modeling', 'Начала математического анализа. Решение задач с помощью математического моделирования'),
  ('math', 8, 'Планиметрия', 14, 'plane-figures', 'Понятие о геометрических фигурах. Взаимное расположение геометрических фигур'),
  ('math', 8, 'Планиметрия', 15, 'metric-relations-plane', 'Метрические соотношения. Векторы и преобразования'),
  ('math', 9, 'Стереометрия', 16, 'solid-figures', 'Понятие о геометрических фигурах в пространстве'),
  ('math', 9, 'Стереометрия', 17, 'metric-relations-space', 'Метрические соотношения в пространстве'),
  ('math', 10, 'Векторы и преобразования в пространстве', 18, 'vectors-in-space', 'Векторы и преобразования в пространстве'),

  -- physics: Физика (40 заданий, 50 баллов)
  ('physics', 1, 'Механика', 1, 'kinematics', 'Кинематика'),
  ('physics', 1, 'Механика', 2, 'dynamics', 'Динамика'),
  ('physics', 1, 'Механика', 3, 'statics', 'Статика'),
  ('physics', 1, 'Механика', 4, 'conservation-laws', 'Законы сохранения'),
  ('physics', 1, 'Механика', 5, 'fluid-gas-mechanics', 'Механика жидкостей и газов'),
  ('physics', 2, 'Тепловая физика', 6, 'kinetic-theory', 'Основы молекулярно-кинетической теории газов'),
  ('physics', 2, 'Тепловая физика', 7, 'gas-laws', 'Газовые законы'),
  ('physics', 2, 'Тепловая физика', 8, 'thermodynamics', 'Основы термодинамики'),
  ('physics', 2, 'Тепловая физика', 9, 'liquids-and-solids', 'Жидкие и твёрдые тела'),
  ('physics', 3, 'Электричество и магнетизм', 10, 'electrostatics', 'Электростатика'),
  ('physics', 3, 'Электричество и магнетизм', 11, 'direct-current', 'Постоянный ток'),
  ('physics', 3, 'Электричество и магнетизм', 12, 'current-in-media', 'Электрический ток в различных средах'),
  ('physics', 3, 'Электричество и магнетизм', 13, 'magnetic-field', 'Магнитное поле'),
  ('physics', 3, 'Электричество и магнетизм', 14, 'electromagnetic-induction', 'Электромагнитная индукция'),
  ('physics', 4, 'Электромагнитные колебания', 15, 'mechanical-oscillations', 'Механические колебания'),
  ('physics', 4, 'Электромагнитные колебания', 16, 'em-oscillations-ac', 'Электромагнитные колебания. Переменный ток'),
  ('physics', 5, 'Электромагнитные волны', 17, 'wave-motion', 'Волновое движение'),
  ('physics', 5, 'Электромагнитные волны', 18, 'electromagnetic-waves', 'Электромагнитные волны'),
  ('physics', 6, 'Оптика', 19, 'wave-optics', 'Волновая оптика'),
  ('physics', 6, 'Оптика', 20, 'geometric-optics', 'Геометрическая оптика'),
  ('physics', 7, 'Элементы теории относительности', 21, 'relativity', 'Элементы теории относительности'),
  ('physics', 8, 'Квантовая физика', 22, 'atomic-and-quantum-physics', 'Атомная и квантовая физика'),
  ('physics', 8, 'Квантовая физика', 23, 'nuclear-physics', 'Физика атомного ядра'),
  ('physics', 9, 'Нанотехнология и наноматериалы', 24, 'nanotechnology', 'Нанотехнология и наноматериалы'),
  ('physics', 10, 'Космология', 25, 'cosmology', 'Космология'),

  -- informatics: Информатика (40 заданий, 50 баллов)
  ('informatics', 1, 'Компьютерные системы', 1, 'computer-devices', 'Устройства компьютера'),
  ('informatics', 1, 'Компьютерные системы', 2, 'networks-and-security', 'Компьютерные сети. Организация компьютерных сетей. Информационная безопасность'),
  ('informatics', 2, 'Информационные процессы', 3, 'information-representation', 'Представление и измерение информации. Кодирование информации'),
  ('informatics', 2, 'Информационные процессы', 4, 'number-systems', 'Системы счисления'),
  ('informatics', 2, 'Информационные процессы', 5, 'logic-foundations', 'Логические основы компьютера'),
  ('informatics', 3, 'Компьютерное мышление', 6, 'python-programming', 'Программирование алгоритмов на языке программирования Python'),
  ('informatics', 3, 'Компьютерное мышление', 7, 'algorithms-and-programs', 'Алгоритмы и программы (функция, рекурсия, работа со строками, работа с файлами, сортировка, граф)'),
  ('informatics', 4, 'Аппаратное и программное обеспечение', 8, 'hardware-and-software', 'Аппаратное обеспечение. Программное обеспечение'),
  ('informatics', 5, 'Информационные процессы и системы', 9, 'relational-databases', 'Реляционная база данных'),
  ('informatics', 5, 'Информационные процессы и системы', 10, 'database-design-sql', 'Разработка базы данных. Структурированные запросы'),
  ('informatics', 5, 'Информационные процессы и системы', 11, 'it-trends-and-3d', 'Современные тенденции развития информационных технологий. IT Startup. 3D-моделирование'),
  ('informatics', 6, 'Создание и преобразование информационных объектов', 12, 'information-objects', 'Создание и преобразование информационных объектов'),
  ('informatics', 6, 'Создание и преобразование информационных объектов', 13, 'web-design', 'Веб-проектирование'),

  -- math-literacy: Математическая грамотность (10 заданий, 10 баллов)
  ('math-literacy', 1, 'Количественные рассуждения', 1, 'numeric-logic', 'Логические задания, в которых присутствуют числовые значения'),
  ('math-literacy', 1, 'Количественные рассуждения', 2, 'word-problems-equations', 'Логические задачи на применение текстовых задач с помощью уравнений и составлением буквенных выражений'),
  ('math-literacy', 1, 'Количественные рассуждения', 3, 'percentages-and-charts', 'Логические задачи на вычисление процентов. Логические задачи для статистических данных, представленных в виде круговых и столбчатых диаграмм'),
  ('math-literacy', 2, 'Неопределённость', 4, 'mean-median-mode', 'Среднее арифметическое нескольких чисел, размах, медиана и мода ряда числовых данных'),
  ('math-literacy', 2, 'Неопределённость', 5, 'statistics-combinatorics-probability', 'Статистические таблицы, полигоны частот, гистограммы. Теория множеств и элементы логики. Основы комбинаторики. Основы теории вероятностей'),
  ('math-literacy', 3, 'Изменение и зависимости', 6, 'dependencies', 'Логические задачи на изменение одной величины в зависимости от другой'),
  ('math-literacy', 3, 'Изменение и зависимости', 7, 'sequences-and-tables', 'Логические задания на применение последовательности. Логические задания на умение анализировать данные в таблице'),
  ('math-literacy', 4, 'Пространство и форма', 8, 'geometric-logic', 'Логические задачи с геометрическим содержанием и нестандартные задачи с геометрическим содержанием'),
  ('math-literacy', 4, 'Пространство и форма', 9, 'area-and-perimeter', 'Логические задачи на применение формулы площади и периметра геометрических фигур'),
  ('math-literacy', 4, 'Пространство и форма', 10, 'surface-area', 'Логические задачи на применение формулы площади поверхности геометрических тел')
) AS t(subject_slug, section_no, section_name_ru, topic_no, slug, name_ru)
WHERE s.slug = t.subject_slug
ON CONFLICT (subject_id, slug) DO UPDATE SET
  section_no = EXCLUDED.section_no,
  section_name_ru = EXCLUDED.section_name_ru,
  section_name_kk = EXCLUDED.section_name_kk,
  topic_no = EXCLUDED.topic_no;

-- 4. profiles RLS — пересоздаём по устоявшемуся паттерну (см. 0008/0009/0010/
-- 0012/0014 — в проде терялись при поднятии БД через устаревший run_all.sql).
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
