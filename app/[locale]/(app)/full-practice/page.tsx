import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isPilotTopicsOnly } from '@/lib/learning/feature-flag';
import { createClient } from '@/lib/supabase/server';
import { getExamAvailability } from '@/lib/supabase/queries';
import { MockExamView } from '@/components/practice/MockExamView';
import type { Locale } from '@/types/db';

export default async function FullPracticePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Пилот «только темы»: эти попытки не видны учителю, ведём ученика в темы.
  if (isPilotTopicsOnly()) redirect(`/${locale}/subjects`);

  // Маршрут защищён middleware, но user нужен явно: прогресс пробника
  // в localStorage неймспейсится по userId.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const availability = await getExamAvailability(locale as Locale);

  return <MockExamView availability={availability} locale={locale} userId={user.id} />;
}
