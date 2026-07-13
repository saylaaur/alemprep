import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/queries';

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await getProfile();

  // Жёсткий гейт на онбординг — только при СУЩЕСТВУЮЩЕМ профиле: если профиль
  // ещё не создан триггером (null), редирект сюда же зациклился бы.
  if (profile && !profile.second_subject) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <AppShell profile={profile} email={user?.email ?? null}>
      {children}
    </AppShell>
  );
}
