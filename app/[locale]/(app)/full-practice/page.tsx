import { setRequestLocale } from 'next-intl/server';
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

  const availability = await getExamAvailability(locale as Locale);

  return <MockExamView availability={availability} locale={locale} />;
}
