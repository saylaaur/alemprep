import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
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
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <MobileNav profile={profile} email={email} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
