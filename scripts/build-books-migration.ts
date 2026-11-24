/**
 * Генерирует миграцию с таблицами книг-конспектов и сидом каталога.
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/build-books-migration.ts > supabase/migrations/0042_books_spaced_review.sql
 * Источники: scripts/data/books-catalog.json (подтемы) и scripts/data/books/<slug>.json (готовые конспекты).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookContentSchema } from '../lib/books/content';
import { loadBooksCatalog } from '../lib/books/catalog';

const root = join(__dirname, '..');
const lit = (s: string | null) => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`);
const json = (v: unknown) => (v === null ? 'NULL' : `${lit(JSON.stringify(v))}::jsonb`);

function readContent(slug: string): { ru: unknown; kk: unknown } | null {
  const file = join(root, 'scripts/data/books', `${slug}.json`);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { ru?: unknown; kk?: unknown };
  const ru = bookContentSchema.parse(raw.ru);
  const kk = raw.kk === undefined ? null : bookContentSchema.parse(raw.kk);
  return { ru, kk };
}

const rows = loadBooksCatalog().map((b) => {
  const content = readContent(b.slug);
  return `  (${[lit(b.subject), lit(b.topic), b.sortOrder, lit(b.slug), lit(b.nameRu), lit(b.nameKk), json(content?.ru ?? null), json(content?.kk ?? null)].join(', ')})`;
});

const sql = `-- =====================================================
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
${rows.join(',\n')}
) AS v(subject_slug, topic_slug, sort_order, slug, name_ru, name_kk, content_ru, content_kk)
JOIN public.subjects s ON s.slug = v.subject_slug
JOIN public.topics t ON t.subject_id = s.id AND t.slug = v.topic_slug
ON CONFLICT (slug) DO NOTHING;
`;

process.stdout.write(sql);
