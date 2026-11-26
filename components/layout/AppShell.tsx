import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { BottomTabBar } from './BottomTabBar';
import { AppBackdrop } from './AppBackdrop';
import { UiSoundListener } from '@/components/sound/SoundProvider';
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
    <div className="relative isolate flex min-h-dvh">
      {/* Один длинный градиент за всеми экранами */}
      <AppBackdrop />
      <Sidebar profile={profile} email={email} isTeacher={isTeacher} topicsOnly={topicsOnly} />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <MobileNav profile={profile} email={email} isTeacher={isTeacher} />
        {/* нижний отступ на моб. — под таб-бар (плавающий таб-бар + отступ) */}
        <main className="flex-1 pb-[96px] md:pb-0">{children}</main>
      </div>
      <BottomTabBar topicsOnly={topicsOnly} />
      <UiSoundListener />
    </div>
  );
}
