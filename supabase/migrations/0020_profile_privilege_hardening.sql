-- 0020: Prevent authenticated users from promoting themselves to admin.
--
-- RLS limits profiles UPDATE to the user's own row, but it does not limit
-- which columns may be changed. A browser client could therefore set
-- is_admin = true and immediately satisfy the admin policies.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remove broad table-level writes, then grant only the fields used by the
-- product. New privileged columns will remain non-writable by default.
REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  full_name,
  avatar_url,
  locale,
  daily_goal,
  current_streak,
  last_active_date,
  xp,
  longest_streak,
  second_subject,
  exam_date,
  target_score,
  streak_freezes,
  last_freeze_used_date
) ON TABLE public.profiles TO authenticated;

-- Profiles are created by handle_new_user(). Direct client inserts are not
-- required and would otherwise allow choosing privileged column values.
REVOKE INSERT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- Defense in depth for installations whose grants were changed manually.
CREATE OR REPLACE FUNCTION public.prevent_client_admin_promotion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'is_admin can only be changed by a trusted backend';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_client_admin_promotion ON public.profiles;
CREATE TRIGGER prevent_client_admin_promotion
  BEFORE UPDATE OF is_admin ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_admin_promotion();

REVOKE ALL ON FUNCTION public.prevent_client_admin_promotion() FROM PUBLIC;
