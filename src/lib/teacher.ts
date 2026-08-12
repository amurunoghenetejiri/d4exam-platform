import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";

export type TeacherCourse = {
  id: string;
  code: string;
  name: string;
  credit_units: number;
  status: string;
};

export type TeacherContext = {
  teacherId: string;
  staffId: string;
  schoolId: string;
  profileId: string;
  fullName: string;
  email: string;
  schoolName: string | null;
  courses: TeacherCourse[];
  courseIds: string[];
};

/**
 * Loads the signed-in teacher record and only courses assigned by admin
 * via teacher_courses. No mock / placeholder data.
 */
export function useTeacherContext() {
  const { data: session } = useSessionUser();

  return useQuery({
    queryKey: ["teacher-context", session?.profileId, session?.schoolId],
    enabled: Boolean(session?.profileId && session?.schoolId && session.role === "teacher"),
    staleTime: 15_000,
    queryFn: async (): Promise<TeacherContext | null> => {
      if (!session?.profileId || !session.schoolId) return null;

      const { data: teacher, error: tErr } = await supabase
        .from("teachers")
        .select("id, staff_id, school_id, profile_id")
        .eq("profile_id", session.profileId)
        .eq("school_id", session.schoolId)
        .maybeSingle();

      if (tErr) throw tErr;
      if (!teacher) return null;

      const { data: links, error: lErr } = await supabase
        .from("teacher_courses")
        .select("course_id, courses(id, code, name, credit_units, status)")
        .eq("teacher_id", teacher.id)
        .eq("school_id", session.schoolId);

      if (lErr) throw lErr;

      const courses: TeacherCourse[] = [];
      for (const row of links ?? []) {
        const c = row.courses as
          | { id: string; code: string; name: string; credit_units: number; status: string }
          | null
          | undefined;
        if (c?.id) {
          courses.push({
            id: c.id,
            code: c.code,
            name: c.name,
            credit_units: c.credit_units ?? 0,
            status: c.status ?? "active",
          });
        }
      }

      courses.sort((a, b) => a.code.localeCompare(b.code));

      return {
        teacherId: teacher.id,
        staffId: teacher.staff_id,
        schoolId: teacher.school_id,
        profileId: teacher.profile_id ?? session.profileId,
        fullName: session.fullName,
        email: session.email,
        schoolName: session.schoolName,
        courses,
        courseIds: courses.map((c) => c.id),
      };
    },
  });
}
