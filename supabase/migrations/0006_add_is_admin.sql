-- =====================================================
-- 0006: Add is_admin to profiles + admin RLS for questions
-- =====================================================

-- 1. is_admin column (default false — no existing user becomes admin)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Admins can SELECT all questions (including is_published=false)
DROP POLICY IF EXISTS "questions_select_admin" ON public.questions;
CREATE POLICY "questions_select_admin" ON public.questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- 3. Admins can UPDATE questions (publish / unpublish)
DROP POLICY IF EXISTS "questions_update_admin" ON public.questions;
CREATE POLICY "questions_update_admin" ON public.questions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- 4. Admins can DELETE questions
DROP POLICY IF EXISTS "questions_delete_admin" ON public.questions;
CREATE POLICY "questions_delete_admin" ON public.questions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
