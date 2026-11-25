import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';

let db: DbHarness;

beforeAll(async () => { db = await createDbHarness(); });
afterAll(async () => { await db?.close(); });

describe('content library migrations', () => {
  it('exposes book content to signed-in pupils and limits each collection to its owner', async () => {
    const pupil = await db.actor('library-owner');
    const peer = await db.actor('library-peer');
    expect(await db.scalar<boolean>(
      "SELECT has_content AND content_kk IS NOT NULL FROM public.books WHERE slug = 'accelerated-motion'",
    )).toBe(true);
    const id = await db.scalar<string>("SELECT id FROM public.books WHERE slug = 'newton-laws' AND has_content");
    await db.execute(
      "INSERT INTO public.user_books (user_id, book_id, received_on, due_on) VALUES ($1, $2, '2026-11-23', '2026-11-24')",
      [pupil.id, id],
    );
    expect(await db.rest(pupil, '/books?select=slug&slug=eq.newton-laws')).toMatchObject({
      status: 200, data: [{ slug: 'newton-laws' }],
    });
    expect(await db.rest(pupil, '/user_books?select=book_id')).toMatchObject({
      status: 200, data: [{ book_id: id }],
    });
    expect(await db.rest(peer, '/user_books?select=book_id')).toEqual({ status: 200, data: [] });
    expect(await db.scalar<boolean>(
      "SELECT has_function_privilege('authenticated', 'public.record_book_review_v1(uuid,uuid,smallint,date,smallint,date,date,timestamptz,numeric,boolean)', 'EXECUTE')",
    )).toBe(false);

    const args = {
      p_user_id: pupil.id, p_book_id: id, p_previous_stage: 0, p_previous_due_on: '2026-11-24',
      p_stage: 1, p_due_on: '2026-11-27', p_reviewed_on: '2026-11-24',
      p_reviewed_at: '2026-11-24T04:00:00Z', p_recalled: 1, p_lapse: false,
    };
    const results = await Promise.all([
      db.rpc('service', 'record_book_review_v1', args),
      db.rpc('service', 'record_book_review_v1', args),
    ]);
    expect(results).toEqual(expect.arrayContaining([{ status: 200, data: true }, { status: 200, data: false }]));
    expect(await db.scalar<number>(
      'SELECT reviews_count FROM public.user_books WHERE user_id = $1 AND book_id = $2',
      [pupil.id, id],
    )).toBe(1);
    expect(await db.scalar<number>(
      'SELECT count(*)::int FROM public.book_reviews WHERE user_id = $1 AND book_id = $2',
      [pupil.id, id],
    )).toBe(1);
  });

  it('loads the bilingual first-term books and preserves edits when the seed is replayed', async () => {
    const seed = readFileSync('supabase/migrations/0045_first_term_books.sql', 'utf8');
    const slugs = [...seed.matchAll(/^WHERE slug = '([a-z0-9-]+)' AND content_ru IS NULL;$/gm)].map((match) => match[1]);
    expect(slugs).toHaveLength(30);
    expect(await db.scalar<number>(
      'SELECT count(*)::int FROM public.books WHERE slug = ANY($1::text[]) AND has_content AND content_kk IS NOT NULL',
      [slugs],
    )).toBe(slugs.length);
    const math = JSON.parse(readFileSync('scripts/data/books/arithmetic-roots.json', 'utf8'));
    expect(await db.scalar<boolean>(
      "SELECT content_ru = $1::jsonb AND content_kk = $2::jsonb FROM public.books WHERE slug = 'arithmetic-roots'",
      [JSON.stringify(math.ru), JSON.stringify(math.kk)],
    )).toBe(true);

    const tx = await db.connection();
    try {
      await tx.execute('BEGIN');
      await tx.execute(
        "UPDATE public.books SET content_ru = $1::jsonb WHERE slug = 'arithmetic-roots'",
        [JSON.stringify({ pages: [{ title: 'Synthetic editorial change', blocks: [{ type: 'text', text: 'Keep this edit.' }] }] })],
      );
      await tx.execute(seed);
      expect(await tx.scalar<string>(
        "SELECT content_ru #>> '{pages,0,title}' FROM public.books WHERE slug = 'arithmetic-roots'",
      )).toBe('Synthetic editorial change');
    } finally {
      await tx.execute('ROLLBACK');
      tx.release();
    }
  });

  it('pairs a synthetic reminder account once per code', async () => {
    const pupil = await db.actor('library-reminder');
    const code = 'synthetic-link-code-for-ci';
    await db.execute(
      "INSERT INTO public.telegram_link_codes (code, user_id, expires_at) VALUES ($1, $2, now() + interval '10 minutes')",
      [code, pupil.id],
    );
    const rpc = 'link_telegram_account_v1';
    const args = { p_code: code, p_chat_id: 1234 };
    expect(await db.rpc('service', rpc, args)).toEqual({ status: 200, data: pupil.id });
    expect(await db.rpc('service', rpc, args)).toEqual({ status: 200, data: null });
    expect(await db.scalar<string>('SELECT user_id FROM public.telegram_links WHERE chat_id = 1234')).toBe(pupil.id);
  });
});
