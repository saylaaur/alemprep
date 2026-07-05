import {
  Footprints,
  CircleCheckBig,
  Medal,
  Flame,
  CalendarCheck,
  Target,
  ClipboardCheck,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import type { AchievementKey } from '@/lib/gamification';

/**
 * Витринные метаданные бейджей: иконка (lucide) + ключи i18n.
 * Тексты — в namespace `achievements` (ru.json / kk.json).
 */
export const ACHIEVEMENT_META: Record<
  AchievementKey,
  { icon: LucideIcon }
> = {
  'first-question': { icon: Footprints },
  'solved-100': { icon: CircleCheckBig },
  'solved-500': { icon: Medal },
  'streak-7': { icon: Flame },
  'streak-30': { icon: CalendarCheck },
  'topic-mastery': { icon: Target },
  'exam-complete': { icon: ClipboardCheck },
  'exam-90': { icon: Trophy },
};
