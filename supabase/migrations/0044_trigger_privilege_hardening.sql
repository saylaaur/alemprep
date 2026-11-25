-- These functions are invoked by existing triggers rather than application RPCs.
ALTER FUNCTION public.handle_updated_at() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.handle_updated_at()
  FROM PUBLIC, anon, authenticated;
