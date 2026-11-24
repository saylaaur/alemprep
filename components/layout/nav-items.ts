import {
  LayoutDashboard,
  BookOpen,
  LibraryBig,
  PlayCircle,
  Timer,
  LineChart,
  Users,
  UserPlus,
  FunctionSquare,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react';
import { isLocalMode } from '@/lib/data-mode';

export type NavItem = {
  href: '/dashboard' | '/videos' | '/library' | '/problems' | '/subjects' | '/full-practice' | '/progress';
  labelKey: 'dashboard' | 'videos' | 'library' | 'problems' | 'subjects' | 'fullPractice' | 'progress';
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/videos', labelKey: 'videos', icon: PlayCircle },
  { href: '/library', labelKey: 'library', icon: LibraryBig },
  { href: '/problems', labelKey: 'problems', icon: FolderOpen },
  { href: '/subjects', labelKey: 'subjects', icon: BookOpen },
  { href: '/full-practice', labelKey: 'fullPractice', icon: Timer },
  { href: '/progress', labelKey: 'progress', icon: LineChart },
];

/** Без базы не работает тренажёр по предметам — его в меню нет (пробник работает на вопросах уроков). */
const LOCAL_HIDDEN: ReadonlyArray<string> = ['/subjects'];

/** Пилот «только темы» прячет пробник: его попытки не видны учителю. */
export function visibleNavItems(topicsOnly: boolean, local: boolean = isLocalMode()): NavItem[] {
  return navItems.filter((item) => {
    if (local && LOCAL_HIDDEN.includes(item.href)) return false;
    if (topicsOnly && item.href === '/full-practice') return false;
    return true;
  });
}

export const extraNavItems = [
  { href: '/visualization', labelKey: 'visualization', icon: FunctionSquare },
  { href: '/join-class', labelKey: 'joinClass', icon: UserPlus },
  { href: '/teacher', labelKey: 'teacher', icon: Users },
] as const;

/** Дополнительные пункты: «Кабинет учителя» — только учителю; вступление в класс и кабинет — только с базой. */
export function visibleExtraNavItems(isTeacher: boolean, local: boolean = isLocalMode()) {
  return extraNavItems.filter((item) => {
    if (local && item.href !== '/visualization') return false;
    return item.href !== '/teacher' || isTeacher;
  });
}
