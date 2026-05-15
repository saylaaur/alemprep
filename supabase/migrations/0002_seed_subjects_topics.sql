-- =====================================================
-- Seed: subjects (3) + math topics по спецификации НЦТ (12)
-- =====================================================

INSERT INTO public.subjects (slug, name_ru, name_kk, icon, is_active, sort_order) VALUES
  ('math',        'Математика',  'Математика',  'Calculator', true,  1),
  ('physics',     'Физика',      'Физика',      'Atom',       false, 2),
  ('informatics', 'Информатика', 'Информатика', 'Code2',      false, 3)
ON CONFLICT (slug) DO NOTHING;

-- Math topics (по спецификации НЦТ — профильная математика)
INSERT INTO public.topics (subject_id, slug, name_ru, name_kk, sort_order)
SELECT s.id, t.slug, t.name_ru, t.name_kk, t.sort_order
FROM public.subjects s,
(VALUES
  ('algebra',        'Алгебраические выражения',       'Алгебралық өрнектер',          1),
  ('equations',      'Уравнения и неравенства',        'Теңдеулер мен теңсіздіктер',   2),
  ('functions',      'Функции и графики',              'Функциялар мен графиктер',     3),
  ('logarithms',     'Логарифмы',                       'Логарифмдер',                  4),
  ('trigonometry',   'Тригонометрия',                   'Тригонометрия',                5),
  ('progressions',   'Прогрессии',                      'Прогрессиялар',                6),
  ('planimetry',     'Планиметрия',                     'Планиметрия',                  7),
  ('stereometry',    'Стереометрия',                    'Стереометрия',                 8),
  ('derivatives',    'Производная и интеграл',         'Туынды және интеграл',         9),
  ('combinatorics',  'Комбинаторика и вероятность',    'Комбинаторика және ықтималдық', 10),
  ('statistics',     'Статистика',                      'Статистика',                   11),
  ('text_problems',  'Текстовые задачи',                'Мәтінді есептер',              12)
) AS t(slug, name_ru, name_kk, sort_order)
WHERE s.slug = 'math'
ON CONFLICT (subject_id, slug) DO NOTHING;
