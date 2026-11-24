import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeEqual, sendTelegramMessage, telegramConfigured } from '@/lib/telegram/bot';
import { runBookReminders, type ReminderTarget } from '@/lib/telegram/reminders';
import type { ReminderBook } from '@/lib/telegram/messages';
import { daysBetween } from '@/lib/books/schedule';
import { localDateStr } from '@/lib/streak';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH = 500;

/**
 * Утреннее напоминание о книгах. Запускает Vercel Cron (vercel.json) каждый
 * день в 04:00 UTC = 09:00 в Казахстане. Vercel присылает
 * Authorization: Bearer <CRON_SECRET>; без него — 401.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!safeEqual(token, process.env.CRON_SECRET?.trim())) return NextResponse.json({ ok: false }, { status: 401 });
  if (!telegramConfigured()) return NextResponse.json({ ok: true, skipped: 'telegram-not-configured' });

  const admin = createAdminClient();
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');

  const report = await runBookReminders({
    today: localDateStr(),
    libraryUrl: (locale) => `${site}/${locale}/library`,

    async loadTargets(today) {
      const { data, error } = await admin
        .from('telegram_links')
        .select('user_id, chat_id, last_reminded_on')
        .or(`last_reminded_on.is.null,last_reminded_on.lt.${today}`)
        .limit(BATCH);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.user_id as string);
      if (ids.length === 0) return [];
      const { data: profiles } = await admin.from('profiles').select('id, locale').in('id', ids);
      const loc = new Map((profiles ?? []).map((p) => [p.id as string, (p.locale === 'kk' ? 'kk' : 'ru') as Locale]));
      return (data ?? []).map((r): ReminderTarget => ({
        userId: r.user_id as string,
        chatId: Number(r.chat_id),
        locale: loc.get(r.user_id as string) ?? 'ru',
      }));
    },

    async loadDue(userIds, today, localeOf) {
      const { data, error } = await admin
        .from('user_books')
        .select('user_id, due_on, books!inner(slug, name_ru, name_kk)')
        .in('user_id', userIds)
        .lte('due_on', today)
        .order('due_on', { ascending: true });
      if (error) throw error;
      const out = new Map<string, ReminderBook[]>();
      for (const r of (data ?? []) as unknown as Array<{ user_id: string; due_on: string; books: { slug: string; name_ru: string; name_kk: string | null } }>) {
        const name = localeOf(r.user_id) === 'kk' && r.books.name_kk ? r.books.name_kk : r.books.name_ru;
        const list = out.get(r.user_id) ?? [];
        list.push({ slug: r.books.slug, name, overdueDays: Math.max(0, daysBetween(r.due_on, today)) });
        out.set(r.user_id, list);
      }
      return out;
    },

    send: sendTelegramMessage,

    async markReminded(userId, today) {
      await admin.from('telegram_links').update({ last_reminded_on: today }).eq('user_id', userId);
    },

    async unlink(userId) {
      await admin.from('telegram_links').delete().eq('user_id', userId);
    },
  });

  return NextResponse.json({ ok: true, ...report });
}
