import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile, getWeeklyTestSummary } from '@/lib/supabase/queries';
import { WeeklyTestView } from '@/components/practice/WeeklyTestView';

export default async function WeeklyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const profile = await getProfile();
  if (!profile?.second_subject) redirect(`/${locale}/onboarding`);

  const summary = await getWeeklyTestSummary(user.id);

  return <WeeklyTestView second={profile.second_subject} locale={locale} summary={summary} />;
}
