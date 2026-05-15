import { Sidebar } from './Sidebar';
import type { Profile } from '@/types/db';

export function AppShell({
  children,
  profile,
  email,
}: {
  children: React.ReactNode;
  profile: Profile | null;
  email: string | null;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar profile={profile} email={email} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
