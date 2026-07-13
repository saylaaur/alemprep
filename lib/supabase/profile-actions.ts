'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';
import { MIN_DAILY_GOAL, MAX_DAILY_GOAL } from '@/lib/settings';
import { validateOnboarding } from '@/lib/onboarding';
import type { Locale } from '@/types/db';

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

/**
 * Завершает онбординг: пара предметов, дата ЕНТ, целевой балл, дневная цель —
 * все 4 сразу (в отличие от updateProfileSettings, здесь это не частичное
 * обновление). 0 обновлённых строк — тоже ошибка: RLS могла молча съесть UPDATE
 * (как уже случалось с profiles — см. 0008/0009/0010).
 */
export async function completeOnboarding(input: {
  secondSubject: string;
  examDate: string;
  targetScore: number;
  dailyGoal: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const validated = validateOnboarding(input);
  if (!validated.ok) return { ok: false, error: validated.error };

  const dailyGoal = Number.isFinite(input.dailyGoal)
    ? Math.min(MAX_DAILY_GOAL, Math.max(MIN_DAILY_GOAL, Math.round(input.dailyGoal)))
    : MIN_DAILY_GOAL;

  const { data, error } = await supabase
    .from('profiles')
    .update({
      second_subject: validated.value.secondSubject,
      exam_date: validated.value.examDate,
      target_score: validated.value.targetScore,
      daily_goal: dailyGoal,
    })
    .eq('id', user.id)
    .select('id');

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'update_failed' };

  revalidatePath('/[locale]/(app)/dashboard', 'page');
  revalidatePath('/[locale]/(app)/settings', 'page');
  return { ok: true };
}
