import {
  LayoutDashboard,
  BookOpen,
  Timer,
  LineChart,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: '/dashboard' | '/subjects' | '/full-practice' | '/progress';
  labelKey: 'dashboard' | 'subjects' | 'fullPractice' | 'progress';
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/subjects', labelKey: 'subjects', icon: BookOpen },
  { href: '/full-practice', labelKey: 'fullPractice', icon: Timer },
  { href: '/progress', labelKey: 'progress', icon: LineChart },
];
