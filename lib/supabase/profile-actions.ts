'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';
import { MIN_DAILY_GOAL, MAX_DAILY_GOAL } from '@/lib/settings';
import { validateOnboarding, validateExamDate, clampTargetScore } from '@/lib/onboarding';
import { EXAM_SECOND_SUBJECTS, type ExamSecondSubject } from '@/lib/exam';
import { isLocalMode } from '@/lib/data-mode';
import { updateLocalState } from '@/lib/local/store';
import type { Locale } from '@/types/db';

/**
 * Обновляет пользовательские настройки в profiles: язык, дневную цель и/или
 * (после онбординга) пару предметов/дату ЕНТ/целевой балл. Пустой/неуказанный
 * ввод игнорируется (частичное обновление) — в отличие от completeOnboarding,
 * где все 3 поля экзамена обязательны сразу. Пишем только своё
 * (RLS profiles_update_own), правильность значений валидируем на сервере.
 */
export async function updateProfileSettings(input: {
  locale?: Locale;
  dailyGoal?: number;
  secondSubject?: string;
  examDate?: string;
  targetScore?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const local = isLocalMode();
  const supabase = local ? null : await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!local && !user) return { ok: false, error: 'unauthenticated' };

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
  if (input.secondSubject !== undefined) {
    if (!EXAM_SECOND_SUBJECTS.includes(input.secondSubject as ExamSecondSubject)) {
      return { ok: false, error: 'invalid_subject' };
    }
    update.second_subject = input.secondSubject;
  }
  if (input.examDate !== undefined) {
    const examDate = validateExamDate(input.examDate);
    if (!examDate) return { ok: false, error: 'invalid_exam_date' };
    update.exam_date = examDate;
  }
  if (input.targetScore !== undefined) {
    if (!Number.isFinite(input.targetScore)) return { ok: false, error: 'invalid_target_score' };
    update.target_score = clampTargetScore(input.targetScore);
  }
  if (Object.keys(update).length === 0) return { ok: true };

  if (supabase && user) {
    const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
    if (error) return { ok: false, error: 'temporarily-unavailable' };
  } else {
    // Без базы настройки живут в cookie браузера.
    try {
      await updateLocalState((s) => ({
        ...s,
        profile: {
          ...s.profile,
          ...(update.locale !== undefined ? { locale: update.locale as Locale } : {}),
          ...(update.daily_goal !== undefined ? { dailyGoal: update.daily_goal as number } : {}),
          ...(update.second_subject !== undefined ? { secondSubject: update.second_subject as 'physics' | 'informatics' } : {}),
          ...(update.exam_date !== undefined ? { examDate: update.exam_date as string } : {}),
          ...(update.target_score !== undefined ? { targetScore: update.target_score as number } : {}),
        },
      }));
    } catch {
      return { ok: false, error: 'temporarily-unavailable' };
    }
  }

  // Дашборд (кольцо дневной цели, план) и сама страница настроек должны увидеть новое значение.
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

  if (error) return { ok: false, error: 'temporarily-unavailable' };
  if (!data || data.length === 0) return { ok: false, error: 'update_failed' };

  revalidatePath('/[locale]/(app)/dashboard', 'page');
  revalidatePath('/[locale]/(app)/settings', 'page');
  return { ok: true };
}
