import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsView } from '@/components/settings/SettingsView';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/queries';
import type { Locale } from '@/types/db';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('settings');
  const supabase = await createClient();
  const [{ data: { user } }, profile] = await Promise.all([
    supabase.auth.getUser(),
    getProfile(),
  ]);

  const email = user?.email ?? null;
  const name = profile?.full_name?.trim() || email || t('defaultName');

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <SettingsView
        locale={locale as Locale}
        displayName={name}
        email={email}
        avatarUrl={profile?.avatar_url ?? null}
        dailyGoal={profile?.daily_goal ?? 20}
      />
    </>
  );
}
