import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { BottomTabBar } from './BottomTabBar';
import type { Profile } from '@/types/db';

export function AppShell({
  children,
  profile,
  email,
  isTeacher = false,
  topicsOnly = false,
}: {
  children: React.ReactNode;
  profile: Profile | null;
  email: string | null;
  isTeacher?: boolean;
  topicsOnly?: boolean;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar profile={profile} email={email} isTeacher={isTeacher} topicsOnly={topicsOnly} />
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <MobileNav profile={profile} email={email} isTeacher={isTeacher} topicsOnly={topicsOnly} />
        {/* нижний отступ на моб. — под таб-бар (68px + safe-area) */}
        <main className="flex-1 pb-[68px] md:pb-0">{children}</main>
      </div>
      <BottomTabBar topicsOnly={topicsOnly} />
    </div>
  );
}
