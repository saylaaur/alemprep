import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeEqual, sendTelegramMessage, telegramConfigured } from '@/lib/telegram/bot';
import { botText, isStopCommand, parseStartCode } from '@/lib/telegram/messages';
import type { Locale } from '@/types/db';

export const dynamic = 'force-dynamic';

type Update = { message?: { text?: unknown; chat?: { id?: unknown; type?: unknown } } };

/**
 * Вебхук бота. Telegram присылает секрет в заголовке X-Telegram-Bot-Api-Secret-Token
 * (задаётся при setWebhook). Без верного секрета — 401, ничего не делаем.
 * После записи отвечаем 200. Временная ошибка хранилища допускает повтор.
 */
export async function POST(req: NextRequest) {
  if (!safeEqual(req.headers.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_WEBHOOK_SECRET?.trim())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!telegramConfigured()) return NextResponse.json({ ok: false }, { status: 404 });
  let update: Update | null;
  try {
    update = (await req.json()) as Update | null;
  } catch {
    return NextResponse.json({ ok: true });
  }
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text;
  // Только личные чаты: напоминания — персональные.
  if (typeof chatId !== 'number' || !Number.isSafeInteger(chatId) || update?.message?.chat?.type !== 'private') return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const code = parseStartCode(text);
  if (code) {
    const { data: userId, error } = await admin.rpc('link_telegram_account_v1', { p_code: code, p_chat_id: chatId });
    if (error) return NextResponse.json({ ok: false }, { status: 503 });
    if (!userId) {
      await sendTelegramMessage(chatId, botText('ru', 'badCode'));
      return NextResponse.json({ ok: true });
    }
    const { data: profile } = await admin.from('profiles').select('locale').eq('id', userId).maybeSingle();
    const locale: Locale = profile?.locale === 'kk' ? 'kk' : 'ru';
    await sendTelegramMessage(chatId, botText(locale, 'linked'));
    return NextResponse.json({ ok: true });
  }

  if (isStopCommand(text)) {
    const { error } = await admin.from('telegram_links').delete().eq('chat_id', chatId);
    if (error) return NextResponse.json({ ok: false }, { status: 503 });
    await sendTelegramMessage(chatId, botText('ru', 'unlinked'));
    return NextResponse.json({ ok: true });
  }

  await sendTelegramMessage(chatId, botText('ru', 'help'));
  return NextResponse.json({ ok: true });
}
