import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";

export type StudentCourse = {
  id: string;
  code: string;
  name: string;
};

export type StudentContext = {
  studentId: string;
  matric: string | null;
  schoolId: string;
  profileId: string;
  fullName: string;
  email: string;
  schoolName: string | null;
  courses: StudentCourse[];
  courseIds: string[];
};

/** Statuses a student is allowed to see (officer must have approved). */
export const STUDENT_VISIBLE_EXAM_STATUSES = [
  "approved",
  "scheduled",
  "published",
  "ongoing",
  "closed",
  "completed",
] as const;

/** Statuses where student may attempt / start the CBT. */
export const STUDENT_STARTABLE_STATUSES = [
  "approved",
  "scheduled",
  "published",
  "ongoing",
] as const;

export function useStudentContext() {
  const { data: session } = useSessionUser();

  return useQuery({
    queryKey: ["student-context", session?.profileId, session?.schoolId],
    enabled: Boolean(session?.profileId && session?.schoolId && session.role === "student"),
    staleTime: 15_000,
    queryFn: async (): Promise<StudentContext | null> => {
      if (!session?.profileId || !session.schoolId) return null;

      const { data: student, error: sErr } = await supabase
        .from("students")
        .select("id, matric_number, student_id, school_id, profile_id")
        .eq("profile_id", session.profileId)
        .eq("school_id", session.schoolId)
        .maybeSingle();

      if (sErr) throw sErr;
      if (!student) return null;

      const { data: links, error: lErr } = await supabase
        .from("student_courses")
        .select("course_id, courses(id, code, name)")
        .eq("student_id", student.id)
        .eq("school_id", session.schoolId);

      if (lErr) throw lErr;

      const courses: StudentCourse[] = [];
      for (const row of links ?? []) {
        const c = row.courses as { id: string; code: string; name: string } | null | undefined;
        if (c?.id) courses.push({ id: c.id, code: c.code, name: c.name });
      }
      courses.sort((a, b) => a.code.localeCompare(b.code));

      return {
        studentId: student.id,
        matric: student.matric_number ?? student.student_id ?? null,
        schoolId: student.school_id,
        profileId: student.profile_id ?? session.profileId,
        fullName: session.fullName,
        email: session.email,
        schoolName: session.schoolName,
        courses,
        courseIds: courses.map((c) => c.id),
      };
    },
  });
}

export function canStartExam(status: string, scheduledStart: string | null): boolean {
  const s = status.toLowerCase();
  if (s === "ongoing") return true;
  if (s === "closed" || s === "completed") return false;
  if (!["approved", "scheduled", "published"].includes(s)) return false;
  if (!scheduledStart) return s === "approved" || s === "published";
  return new Date(scheduledStart).getTime() <= Date.now();
}
