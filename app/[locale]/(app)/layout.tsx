import { AppShell } from '@/components/layout/AppShell';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/queries';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await getProfile();

  return (
    <AppShell profile={profile} email={user?.email ?? null}>
      {children}
    </AppShell>
  );
}
