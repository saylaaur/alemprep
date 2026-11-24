import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeEqual, sendTelegramMessage } from '@/lib/telegram/bot';
import { botText, isStopCommand, parseStartCode } from '@/lib/telegram/messages';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

type Update = { message?: { text?: unknown; chat?: { id?: unknown; type?: unknown } } };

/**
 * Вебхук бота. Telegram присылает секрет в заголовке X-Telegram-Bot-Api-Secret-Token
 * (задаётся при setWebhook). Без верного секрета — 401, ничего не делаем.
 * Всегда отвечаем 200 на валидные запросы, чтобы Telegram не повторял их.
 */
export async function POST(req: NextRequest) {
  if (!safeEqual(req.headers.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_WEBHOOK_SECRET?.trim())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return NextResponse.json({ ok: true });
  }
  const chatId = update.message?.chat?.id;
  const text = update.message?.text;
  // Только личные чаты: напоминания — персональные.
  if (typeof chatId !== 'number' || update.message?.chat?.type !== 'private') return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const code = parseStartCode(text);
  if (code) {
    const { data: row } = await admin
      .from('telegram_link_codes')
      .select('user_id, expires_at')
      .eq('code', code)
      .maybeSingle();
    await admin.from('telegram_link_codes').delete().eq('code', code);
    if (!row || Date.parse(row.expires_at as string) < Date.now()) {
      await sendTelegramMessage(chatId, botText('ru', 'badCode'));
      return NextResponse.json({ ok: true });
    }
    const userId = row.user_id as string;
    const { data: profile } = await admin.from('profiles').select('locale').eq('id', userId).maybeSingle();
    const locale: Locale = profile?.locale === 'kk' ? 'kk' : 'ru';
    // Один чат — один аккаунт: снимаем чат с прежнего владельца.
    await admin.from('telegram_links').delete().eq('chat_id', chatId);
    const { error } = await admin
      .from('telegram_links')
      .upsert({ user_id: userId, chat_id: chatId, linked_at: new Date().toISOString(), last_reminded_on: null }, { onConflict: 'user_id' });
    await sendTelegramMessage(chatId, botText(locale, error ? 'badCode' : 'linked'));
    return NextResponse.json({ ok: true });
  }

  if (isStopCommand(text)) {
    await admin.from('telegram_links').delete().eq('chat_id', chatId);
    await sendTelegramMessage(chatId, botText('ru', 'unlinked'));
    return NextResponse.json({ ok: true });
  }

  await sendTelegramMessage(chatId, botText('ru', 'help'));
  return NextResponse.json({ ok: true });
}
