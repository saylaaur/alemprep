-- XP and streaks are computed by authenticated server actions and must not be
-- writable by the browser through the public Supabase API.
REVOKE UPDATE (xp, current_streak, longest_streak, last_active_date, streak_freezes, last_freeze_used_date)
  ON TABLE public.profiles FROM authenticated;
