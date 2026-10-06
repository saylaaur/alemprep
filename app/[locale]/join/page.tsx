import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { JoinClass } from '@/components/teacher/JoinClass';
import { LanguageSwitcher } from '@/components/language-switcher';

export const dynamic = 'force-dynamic';

// Join links live outside the (app) layout so a new pupil can join before onboarding.
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { code } = await searchParams;
  const initialCode = typeof code === 'string' ? code : '';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = `/${locale}/join${initialCode ? `?code=${encodeURIComponent(initialCode)}` : ''}`;
    redirect(`/${locale}/login?next=${encodeURIComponent(next)}`);
  }

  const t = await getTranslations('teacher');
  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute right-6 top-5">
        <LanguageSwitcher compact />
      </div>
      <div className="w-full max-w-lg space-y-4">
        <h1 className="text-center text-xl font-semibold">{t('joinTitle')}</h1>
        <JoinClass initialCode={initialCode} />
      </div>
    </main>
  );
}
