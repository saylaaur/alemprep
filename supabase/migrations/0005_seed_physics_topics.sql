-- =====================================================
-- Seed: активация предмета «Физика» + темы по спецификации НЦТ (8)
-- =====================================================

-- Активируем предмет (в 0002 он был is_active = false)
UPDATE public.subjects SET is_active = true WHERE slug = 'physics';

-- Темы физики
INSERT INTO public.topics (subject_id, slug, name_ru, name_kk, sort_order)
SELECT s.id, t.slug, t.name_ru, t.name_kk, t.sort_order
FROM public.subjects s
CROSS JOIN (VALUES
  ('mechanics',        'Механика (кинематика и динамика)', 'Механика (кинематика және динамика)', 1),
  ('molecular-physics','Молекулярная физика',              'Молекулалық физика',                  2),
  ('thermodynamics',   'Термодинамика',                    'Термодинамика',                       3),
  ('electrostatics',   'Электростатика',                   'Электростатика',                      4),
  ('electric-current', 'Постоянный электрический ток',     'Тұрақты электр тогы',                 5),
  ('magnetism',        'Магнетизм',                        'Магнетизм',                           6),
  ('optics',           'Оптика',                           'Оптика',                              7),
  ('atomic-nuclear',   'Атомная и ядерная физика',         'Атомдық және ядролық физика',         8)
) AS t(slug, name_ru, name_kk, sort_order)
WHERE s.slug = 'physics'
ON CONFLICT (subject_id, slug) DO NOTHING;
