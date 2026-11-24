import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/**
 * Telegram Bot API. Ключи — только из переменных окружения сервера:
 *   TELEGRAM_BOT_TOKEN       — токен от @BotFather
 *   TELEGRAM_WEBHOOK_SECRET  — секрет, который Telegram присылает в заголовке вебхука
 *   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME — имя бота без @ (для ссылки t.me/…)
 */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim());
}

export function botUsername(): string | null {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') || null;
}

/** Сравнение секретов без утечки по времени. Пустой ожидаемый секрет — всегда отказ. */
export function safeEqual(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SendResult = { ok: true } | { ok: false; blocked: boolean };

/** Отправить сообщение. blocked — пользователь остановил бота (403), привязку можно удалить. */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  button?: { text: string; url: string }
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, blocked: false };
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (button) body.reply_markup = { inline_keyboard: [[{ text: button.text, url: button.url }]] };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, blocked: res.status === 403 };
  } catch {
    return { ok: false, blocked: false };
  }
}
