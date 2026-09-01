-- D4EXAM: Officer can resolve student names/matric for live monitoring.
-- Safe: does NOT disable RLS. Only grants school-scoped read access.

DROP POLICY IF EXISTS "students_select_staff" ON public.students;
CREATE POLICY "students_select_staff" ON public.students
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.in_school(school_id)
    OR public.is_school_teacher(school_id)
    OR public.can_manage_school(school_id)
  );

DROP POLICY IF EXISTS "profiles_school_staff_read_students" ON public.profiles;
CREATE POLICY "profiles_school_staff_read_students" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR auth_user_id = auth.uid()
    OR id = (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.profile_id = profiles.id
        AND (
          public.in_school(s.school_id)
          OR public.is_school_teacher(s.school_id)
          OR public.can_manage_school(s.school_id)
        )
    )
  );

UPDATE public.exam_attempts ea
SET metadata = COALESCE(ea.metadata, '{}'::jsonb) || jsonb_build_object(
  'studentName', COALESCE(
    NULLIF(TRIM(COALESCE(ea.metadata->>'studentName', '')), ''),
    NULLIF(TRIM(COALESCE(s.full_name, '')), ''),
    NULLIF(TRIM(COALESCE(p.full_name, '')), ''),
    NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    ea.metadata->>'studentName'
  ),
  'matricNumber', COALESCE(
    NULLIF(TRIM(COALESCE(ea.metadata->>'matricNumber', '')), ''),
    NULLIF(TRIM(COALESCE(s.matric_number, '')), ''),
    NULLIF(TRIM(COALESCE(s.student_id, '')), ''),
    ea.metadata->>'matricNumber'
  )
)
FROM public.students s
LEFT JOIN public.profiles p ON p.id = s.profile_id
WHERE ea.student_id = s.id
  AND ea.status IN ('in_progress', 'paused', 'held', 'active');

UPDATE public.exam_attempts
SET tab_switch_count = COALESCE(tab_switch_count, 0)
WHERE status IN ('in_progress', 'paused', 'held', 'active')
  AND tab_switch_count IS NULL;
