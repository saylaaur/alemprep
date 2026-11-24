'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/server/actor';
import { createAdminClient } from '@/lib/supabase/admin';
import { botUsername, telegramConfigured } from '@/lib/telegram/bot';

const CODE_TTL_MINUTES = 15;

/** Ссылка t.me/<bot>?start=<код> для привязки Telegram. Код одноразовый, живёт 15 минут. */
export async function createTelegramLinkAction(): Promise<{ ok: true; url: string } | { ok: false; error: 'unauthenticated' | 'not-configured' | 'temporarily-unavailable' }> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: 'unauthenticated' };
  const bot = botUsername();
  if (!telegramConfigured() || !bot) return { ok: false, error: 'not-configured' };
  try {
    const admin = createAdminClient();
    const code = randomBytes(18).toString('base64url');
    // Старые коды этого пользователя больше не нужны.
    await admin.from('telegram_link_codes').delete().eq('user_id', actor.id);
    const { error } = await admin.from('telegram_link_codes').insert({
      code,
      user_id: actor.id,
      expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    });
    if (error) throw error;
    return { ok: true, url: `https://t.me/${bot}?start=${code}` };
  } catch {
    return { ok: false, error: 'temporarily-unavailable' };
  }
}

/** Отключить напоминания в Telegram. */
export async function unlinkTelegramAction(): Promise<{ ok: boolean }> {
  const actor = await getActor();
  if (!actor) return { ok: false };
  const { error } = await createAdminClient().from('telegram_links').delete().eq('user_id', actor.id);
  revalidatePath('/[locale]/(app)/settings', 'page');
  return { ok: !error };
}
