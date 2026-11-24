import { levelProgress } from '@/lib/gamification';
import { localDateStr } from '@/lib/streak';
import type { Gamification } from '@/lib/supabase/queries';
import type { Profile } from '@/types/db';
import { activeDates, activityOn, bestStreakOf, streakOf } from './activity';
import { LOCAL_USER_ID, type LocalState } from './state';

const EPOCH = '2026-01-01T00:00:00.000Z';

/** Профиль «гостя» из настроек в cookie. Остальные поля — нули, как у нового ученика. */
export function localProfile(state: LocalState, today: string = localDateStr()): Profile {
  const p = state.profile;
  const current = streakOf(activeDates(state), today);
  return {
    id: LOCAL_USER_ID,
    full_name: null,
    avatar_url: null,
    locale: p.locale ?? 'ru',
    daily_goal: p.dailyGoal,
    current_streak: current,
    longest_streak: bestStreakOf(state, today),
    last_active_date: activeDates(state).at(-1) ?? null,
    streak_freezes: 0,
    last_freeze_used_date: null,
    xp: 0,
    is_admin: false,
    second_subject: p.secondSubject,
    exam_date: p.examDate,
    target_score: p.targetScore,
    created_at: EPOCH,
    updated_at: EPOCH,
  };
}

/** Сводка геймификации из дней активности: серия, рекорд, решено сегодня. XP и бейджей без базы нет. */
export function localGamification(state: LocalState, today: string = localDateStr()): Gamification {
  const dates = activeDates(state);
  return {
    xp: 0,
    ...levelProgress(0),
    currentStreak: streakOf(dates, today),
    longestStreak: bestStreakOf(state, today),
    streakFreezes: 0,
    freezeJustSaved: false,
    solvedToday: activityOn(state, today).problems,
    activeDates: dates,
    earned: [],
    upcoming: [],
    topicMastery: [],
  };
}
