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
  departmentId: string | null;
  levelId: string | null;
  facultyId: string | null;
  departmentName: string | null;
  facultyName: string | null;
  levelName: string | null;
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

async function loadProgrammeCourses(
  schoolId: string,
  departmentId: string | null,
  levelId: string | null,
): Promise<StudentCourse[]> {
  const byId = new Map<string, StudentCourse>();

  // 1) Courses offered to this department + level (shared offerings)
  if (departmentId && levelId) {
    const { data: offerings } = await supabase
      .from("course_offerings")
      .select("course_id, courses(id, code, name)")
      .eq("school_id", schoolId)
      .eq("department_id", departmentId)
      .eq("level_id", levelId);

    for (const row of offerings ?? []) {
      const c = row.courses as { id: string; code: string; name: string } | null;
      if (c?.id) byId.set(c.id, { id: c.id, code: c.code, name: c.name });
    }
  }

  // 2) Fallback: courses tagged with this department (and level when set)
  if (departmentId) {
    let q = supabase
      .from("courses")
      .select("id, code, name")
      .eq("school_id", schoolId)
      .eq("department_id", departmentId)
      .eq("status", "active");
    if (levelId) q = q.eq("level_id", levelId);
    const { data: tagged } = await q;
    for (const c of tagged ?? []) {
      if (c?.id) byId.set(c.id as string, { id: c.id as string, code: c.code as string, name: c.name as string });
    }
  }

  const list = [...byId.values()];
  list.sort((a, b) => a.code.localeCompare(b.code));
  return list;
}

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
        .select(
          "id, matric_number, student_id, school_id, profile_id, department_id, level_id, faculty_id, full_name, departments(name), faculties(name), levels(name)",
        )
        .eq("profile_id", session.profileId)
        .eq("school_id", session.schoolId)
        .maybeSingle();

      if (sErr) throw sErr;
      if (!student) return null;

      // Explicit enrolments (optional)
      const { data: links } = await supabase
        .from("student_courses")
        .select("course_id, courses(id, code, name)")
        .eq("student_id", student.id)
        .eq("school_id", session.schoolId);

      const byId = new Map<string, StudentCourse>();
      for (const row of links ?? []) {
        const c = row.courses as { id: string; code: string; name: string } | null | undefined;
        if (c?.id) byId.set(c.id, { id: c.id, code: c.code, name: c.name });
      }

      // Programme courses (department + level) — main source for My Courses
      const programme = await loadProgrammeCourses(
        session.schoolId,
        (student.department_id as string | null) ?? null,
        (student.level_id as string | null) ?? null,
      );
      for (const c of programme) byId.set(c.id, c);

      const courses = [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));

      const departments = student.departments as { name: string } | null;
      const faculties = student.faculties as { name: string } | null;
      const levels = student.levels as { name: string } | null;

      return {
        studentId: student.id as string,
        matric: (student.matric_number as string | null) ?? (student.student_id as string | null) ?? null,
        schoolId: student.school_id as string,
        profileId: (student.profile_id as string | null) ?? session.profileId,
        fullName: (student.full_name as string | null) || session.fullName,
        email: session.email,
        schoolName: session.schoolName,
        departmentId: (student.department_id as string | null) ?? null,
        levelId: (student.level_id as string | null) ?? null,
        facultyId: (student.faculty_id as string | null) ?? null,
        departmentName: departments?.name ?? null,
        facultyName: faculties?.name ?? null,
        levelName: levels?.name ?? null,
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
