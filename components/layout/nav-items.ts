import {
  BookOpen,
  FolderOpen,
  FunctionSquare,
  LayoutDashboard,
  LibraryBig,
  LineChart,
  Pencil,
  PlayCircle,
  Timer,
  Users,
} from 'lucide-react';
import { isContentEnabled, isLocalMode } from '@/lib/data-mode';

const navItems = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/practice', labelKey: 'practice', icon: Pencil },
  { href: '/materials', labelKey: 'materials', icon: LibraryBig },
  { href: '/progress', labelKey: 'progress', icon: LineChart },
] as const;

export function visibleNavItems(topicsOnly: boolean) {
  return navItems.filter((item) => item.href !== '/materials' || isContentEnabled(topicsOnly));
}

const teacherItem = { href: '/teacher', labelKey: 'teacher', icon: Users } as const;

export function visibleExtraNavItems(isTeacher: boolean) {
  return isTeacher && !isLocalMode() ? [teacherItem] : [];
}

const practiceLinks = [
  { href: '/subjects', labelKey: 'byTopic', descriptionKey: 'byTopic', icon: BookOpen },
  { href: '/problems', labelKey: 'problemBank', descriptionKey: 'problemBank', icon: FolderOpen },
  { href: '/full-practice', labelKey: 'fullPractice', descriptionKey: 'exam', icon: Timer },
  { href: '/visualization', labelKey: 'visualization', descriptionKey: 'graphs', icon: FunctionSquare },
] as const;

export const materialLinks = [
  { href: '/videos', labelKey: 'videos', descriptionKey: 'videos', icon: PlayCircle },
  { href: '/library', labelKey: 'library', descriptionKey: 'library', icon: LibraryBig },
] as const;

export type SectionLink = (typeof practiceLinks)[number] | (typeof materialLinks)[number];

export function visiblePracticeLinks(topicsOnly: boolean) {
  return practiceLinks.filter(({ href }) => {
    if (href === '/subjects') return !isLocalMode();
    if (href === '/problems') return isContentEnabled(topicsOnly);
    if (href === '/full-practice') return !topicsOnly;
    return true;
  });
}

const practiceSections = [...practiceLinks.map(({ href }) => href), '/weekly', '/diagnostic'];
const materialSections = [...materialLinks.map(({ href }) => href), '/review'];

function isInSection(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (isInSection(pathname, href)) return true;
  if (href === '/practice') return practiceSections.some((prefix) => isInSection(pathname, prefix));
  if (href === '/materials') return materialSections.some((prefix) => isInSection(pathname, prefix));
  return false;
}

export function isImmersivePracticePath(pathname: string): boolean {
  return isInSection(pathname, '/practice/topic') || isInSection(pathname, '/full-practice');
}
