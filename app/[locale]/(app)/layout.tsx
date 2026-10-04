import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/queries';
import { getTeacherGroups } from '@/lib/supabase/queries/teacher';

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
  if (!user) redirect(`/${locale}/login`);
  const profile = await getProfile();
  const groups = await getTeacherGroups();
  const isTeacher = 'data' in groups && groups.data.groups.length > 0;

  // Жёсткий гейт на онбординг — только при СУЩЕСТВУЮЩЕМ профиле: если профиль
  // ещё не создан триггером (null), редирект сюда же зациклился бы.
  if (profile && !profile.second_subject && !isTeacher) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <AppShell profile={profile} email={user?.email ?? null} isTeacher={isTeacher}>
      {children}
    </AppShell>
  );
}
