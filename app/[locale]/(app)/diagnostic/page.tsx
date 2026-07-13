import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/queries';
import { DiagnosticView } from '@/components/practice/DiagnosticView';

export default async function DiagnosticPage({
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

  return <DiagnosticView second={profile.second_subject} locale={locale} />;
}
