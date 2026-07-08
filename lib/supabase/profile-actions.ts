'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';
import type { Locale } from '@/types/db';

/** Границы дневной цели (задач в день). Дефолт схемы — 20. */
export const MIN_DAILY_GOAL = 5;
export const MAX_DAILY_GOAL = 200;

/**
 * Обновляет пользовательские настройки в profiles: язык интерфейса и/или
 * дневную цель. Пустой ввод игнорируется (частичное обновление). Пишем только
 * своё (RLS profiles_update_own), правильность значений валидируем на сервере.
 */
export async function updateProfileSettings(input: {
  locale?: Locale;
  dailyGoal?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const update: Record<string, unknown> = {};
  if (input.locale === 'ru' || input.locale === 'kk') {
    update.locale = input.locale;
  }
  if (typeof input.dailyGoal === 'number' && Number.isFinite(input.dailyGoal)) {
    update.daily_goal = Math.min(
      MAX_DAILY_GOAL,
      Math.max(MIN_DAILY_GOAL, Math.round(input.dailyGoal))
    );
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
  if (error) return { ok: false, error: error.message };

  // Дашборд (кольцо дневной цели) и сама страница настроек должны увидеть новое значение.
  revalidatePath('/[locale]/(app)/dashboard', 'page');
  revalidatePath('/[locale]/(app)/settings', 'page');
  return { ok: true };
}
