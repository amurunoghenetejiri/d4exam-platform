-- ============================================================
-- PASTE THIS ENTIRE FILE INTO: Supabase → SQL Editor → Run
-- Fixes: permission error on exam submit + result not found + rewrite
-- ============================================================

-- 1) Columns used by CBT submit (safe if already present)
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS attempt_id uuid;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS objective_score numeric;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS total_score numeric;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS max_score numeric;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS percentage numeric;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS pass_fail text;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS correct_count integer DEFAULT 0;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS wrong_count integer DEFAULT 0;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS unanswered_count integer DEFAULT 0;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS security_review_status text DEFAULT 'pending';
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS released_by uuid;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Unique pair for upsert (ignore if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.results'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%exam_id%student_id%'
  ) THEN
    BEGIN
      ALTER TABLE public.results ADD CONSTRAINT results_exam_student_unique UNIQUE (exam_id, student_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- 2) Student can SELECT own results (pending + published) so View Results works
DROP POLICY IF EXISTS "results_student_select" ON public.results;
DROP POLICY IF EXISTS "results_select" ON public.results;
CREATE POLICY "results_student_select" ON public.results
  FOR SELECT TO authenticated
  USING (
    student_id = public.current_student_id()
    OR public.is_school_teacher(school_id)
    OR public.can_manage_school(school_id)
    OR public.is_super_admin()
  );

-- 3) Student can INSERT own result on CBT submit
DROP POLICY IF EXISTS "results_student_insert" ON public.results;
DROP POLICY IF EXISTS "results_write" ON public.results;
CREATE POLICY "results_student_insert" ON public.results
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.current_student_id()
    AND public.in_school(school_id)
  );

-- 4) Student can UPDATE own result (upsert path)
DROP POLICY IF EXISTS "results_student_update" ON public.results;
CREATE POLICY "results_student_update" ON public.results
  FOR UPDATE TO authenticated
  USING (student_id = public.current_student_id())
  WITH CHECK (student_id = public.current_student_id());

-- 5) Student can mark own attempt submitted (stops rewrite)
DROP POLICY IF EXISTS "exam_attempts_student_update" ON public.exam_attempts;
CREATE POLICY "exam_attempts_student_update" ON public.exam_attempts
  FOR UPDATE TO authenticated
  USING (student_id = public.current_student_id())
  WITH CHECK (student_id = public.current_student_id());

DROP POLICY IF EXISTS "exam_attempts_student_insert" ON public.exam_attempts;
CREATE POLICY "exam_attempts_student_insert" ON public.exam_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.current_student_id()
    AND public.in_school(school_id)
  );

-- 6) Grants
GRANT SELECT, INSERT, UPDATE ON public.results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.exam_attempts TO authenticated;

-- Done. Test by submitting a CBT exam as a student.
