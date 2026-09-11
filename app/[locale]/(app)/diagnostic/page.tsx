import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile, getExamAvailability } from '@/lib/supabase/queries';
import { hasAssessmentContent } from '@/lib/content-availability';
import { DIAGNOSTIC_BLUEPRINT } from '@/lib/exam';
import { ContentUnavailable } from '@/components/content/ContentUnavailable';
import type { Locale } from '@/types/db';
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

  const availability = await getExamAvailability(locale as Locale);
  if (!hasAssessmentContent(availability, profile.second_subject, DIAGNOSTIC_BLUEPRINT)) return <ContentUnavailable assessment />;

  return <DiagnosticView second={profile.second_subject} locale={locale} />;
}
