-- =====================================================
-- Seed: активация предмета «Информатика» + темы по спецификации НЦТ (6)
-- =====================================================

-- Активируем предмет (в 0002 он был is_active = false)
UPDATE public.subjects SET is_active = true WHERE slug = 'informatics';

-- Темы информатики
INSERT INTO public.topics (subject_id, slug, name_ru, name_kk, sort_order)
SELECT s.id, t.slug, t.name_ru, t.name_kk, t.sort_order
FROM public.subjects s
CROSS JOIN (VALUES
  ('number-systems', 'Системы счисления',        'Санау жүйелері',                1),
  ('algorithms',     'Алгоритмы и блок-схемы',   'Алгоритмдер мен блок-схемалар', 2),
  ('programming',    'Программирование',         'Бағдарламалау',                 3),
  ('databases',      'Базы данных',              'Деректер қоры',                 4),
  ('networks',       'Компьютерные сети',        'Компьютерлік желілер',          5),
  ('logic',          'Логика и булева алгебра',  'Логика және Буль алгебрасы',    6)
) AS t(slug, name_ru, name_kk, sort_order)
WHERE s.slug = 'informatics'
ON CONFLICT (subject_id, slug) DO NOTHING;
