import { Calculator, Atom, Code2, BookOpen, type LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator,
  Atom,
  Code2,
  BookOpen,
};

export function getSubjectIcon(name: string | null | undefined): LucideIcon {
  if (!name) return BookOpen;
  return ICON_MAP[name] ?? BookOpen;
}
