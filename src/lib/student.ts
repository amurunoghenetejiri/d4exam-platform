import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { useRealtimeInvalidate } from "@/lib/realtime";

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
  status: string;
  isActive: boolean;
  sessionName: string | null;
  semesterName: string | null;
  semesterId: string | null;
  courses: StudentCourse[];
  courseIds: string[];
};

export const STUDENT_VISIBLE_EXAM_STATUSES = [
  "approved",
  "scheduled",
  "published",
  "ongoing",
  "closed",
  "completed",
] as const;

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
  semesterId: string | null,
): Promise<StudentCourse[]> {
  const byId = new Map<string, StudentCourse>();
  const semesterFilter = semesterId ? `semester_id.eq.${semesterId},semester_id.is.null` : null;

  function addCourse(c: { id?: string; code?: string; name?: string } | null | undefined) {
    if (c?.id) byId.set(c.id, { id: c.id, code: c.code ?? "", name: c.name ?? "" });
  }

  if (departmentId) {
    let oq = supabase
      .from("course_offerings")
      .select("course_id, semester_id, level_id, courses(id, code, name)")
      .eq("school_id", schoolId)
      .eq("department_id", departmentId);
    if (levelId) oq = oq.eq("level_id", levelId);
    if (semesterFilter) oq = oq.or(semesterFilter);
    const { data: offerings } = await oq;
    for (const row of offerings ?? []) {
      addCourse(row.courses as { id: string; code: string; name: string } | null);
    }
  }

  if (departmentId) {
    let q = supabase
      .from("courses")
      .select("id, code, name, semester_id, level_id")
      .eq("school_id", schoolId)
      .eq("department_id", departmentId)
      .eq("status", "active");
    if (levelId) {
      q = q.or(`level_id.eq.${levelId},level_id.is.null`);
    }
    if (semesterFilter) q = q.or(semesterFilter);
    const { data: tagged } = await q;
    for (const c of tagged ?? []) addCourse(c);
  }

  {
    let q = supabase
      .from("courses")
      .select("id, code, name, semester_id, level_id")
      .eq("school_id", schoolId)
      .is("department_id", null)
      .eq("status", "active");
    if (levelId) {
      q = q.or(`level_id.eq.${levelId},level_id.is.null`);
    }
    if (semesterFilter) q = q.or(semesterFilter);
    const { data: globalCourses } = await q;
    for (const c of globalCourses ?? []) addCourse(c);
  }

  const list = [...byId.values()];
  list.sort((a, b) => a.code.localeCompare(b.code));
  return list;
}

async function loadActiveSessionSemester(schoolId: string): Promise<{
  sessionName: string | null;
  semesterName: string | null;
  semesterId: string | null;
}> {
  const { data: sessions } = await supabase
    .from("academic_sessions")
    .select("id, name, status")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(20);

  const activeSession =
    (sessions ?? []).find((s) => String(s.status).toLowerCase() === "active") ??
    (sessions ?? [])[0] ??
    null;

  let semesterName: string | null = null;
  let semesterId: string | null = null;

  if (activeSession?.id) {
    const { data: semesters } = await supabase
      .from("semesters")
      .select("id, name, status")
      .eq("school_id", schoolId)
      .eq("academic_session_id", activeSession.id)
      .order("created_at", { ascending: false })
      .limit(10);
    const activeSem =
      (semesters ?? []).find((s) => String(s.status).toLowerCase() === "active") ??
      (semesters ?? [])[0] ??
      null;
    semesterName = (activeSem?.name as string | null) ?? null;
    semesterId = (activeSem?.id as string | null) ?? null;
  }

  if (!semesterId) {
    const { data: anySem } = await supabase
      .from("semesters")
      .select("id, name, status")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(10);
    const activeSem =
      (anySem ?? []).find((s) => String(s.status).toLowerCase() === "active") ??
      (anySem ?? [])[0] ??
      null;
    semesterName = (activeSem?.name as string | null) ?? semesterName;
    semesterId = (activeSem?.id as string | null) ?? null;
  }

  return {
    sessionName: (activeSession?.name as string | null) ?? null,
    semesterName,
    semesterId,
  };
}

export function useStudentContext() {
  const { data: session } = useSessionUser();

  return useQuery({
    queryKey: ["student-context", session?.profileId, session?.schoolId],
    enabled: Boolean(session?.profileId && session?.schoolId && session.role === "student"),
    staleTime: 60_000,
    queryFn: async (): Promise<StudentContext | null> => {
      if (!session?.profileId || !session.schoolId) return null;

      let student: Record<string, unknown> | null = null;

      const { data: byProfile, error: sErr } = await supabase
        .from("students")
        .select(
          "id, matric_number, student_id, school_id, profile_id, department_id, level_id, faculty_id, full_name, status, departments(name), faculties(name), levels(name)",
        )
        .eq("profile_id", session.profileId)
        .eq("school_id", session.schoolId)
        .maybeSingle();

      if (sErr) throw sErr;
      student = byProfile as Record<string, unknown> | null;

      if (!student && session.identifier) {
        const { data: byMatric } = await supabase
          .from("students")
          .select(
            "id, matric_number, student_id, school_id, profile_id, department_id, level_id, faculty_id, full_name, status, departments(name), faculties(name), levels(name)",
          )
          .eq("school_id", session.schoolId)
          .ilike("matric_number", session.identifier)
          .limit(1)
          .maybeSingle();
        student = (byMatric as Record<string, unknown> | null) ?? null;
      }

      if (!student) return null;

      const { sessionName, semesterName, semesterId } = await loadActiveSessionSemester(
        session.schoolId,
      );

      const { data: links } = await supabase
        .from("student_courses")
        .select("course_id, semester_id, courses(id, code, name)")
        .eq("student_id", student.id as string)
        .eq("school_id", session.schoolId);

      const byId = new Map<string, StudentCourse>();
      for (const row of links ?? []) {
        const rowSemester = (row as { semester_id?: string | null }).semester_id ?? null;
        if (semesterId && rowSemester && rowSemester !== semesterId) continue;
        const c = row.courses as { id: string; code: string; name: string } | null | undefined;
        if (c?.id) byId.set(c.id, { id: c.id, code: c.code, name: c.name });
      }

      const programme = await loadProgrammeCourses(
        session.schoolId,
        (student.department_id as string | null) ?? null,
        (student.level_id as string | null) ?? null,
        semesterId,
      );
      for (const c of programme) byId.set(c.id, c);

      const courses = [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));

      const departments = student.departments as { name: string } | null;
      const faculties = student.faculties as { name: string } | null;
      const levels = student.levels as { name: string } | null;

      const status = String((student.status as string | null) ?? "active");

      return {
        studentId: student.id as string,
        matric:
          (student.matric_number as string | null) ?? (student.student_id as string | null) ?? null,
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
        status,
        isActive: status.toLowerCase() === "active",
        sessionName,
        semesterName,
        semesterId,
        courses,
        courseIds: courses.map((c) => c.id),
      };
    },
  });
}

export function useStudentRealtimeSync(enabled = true) {
  useRealtimeInvalidate(
    "student-context-sync",
    [
      { table: "students" },
      { table: "student_courses" },
      { table: "courses" },
      { table: "course_offerings" },
      { table: "semesters" },
      { table: "academic_sessions" },
      { table: "profiles" },
    ],
    [["student-context"]],
    enabled,
  );
}

export function canStartExam(
  status: string,
  scheduledStart: string | null,
  scheduledEnd?: string | null,
): boolean {
  const s = status.toLowerCase();
  if (s === "ongoing") return true;
  if (s === "closed" || s === "completed" || s === "cancelled") return false;
  if (!["approved", "scheduled", "published"].includes(s)) return false;
  const now = Date.now();
  if (scheduledEnd && new Date(scheduledEnd).getTime() < now) return false;
  if (!scheduledStart) return s === "approved" || s === "published";
  return new Date(scheduledStart).getTime() <= now;
}

export function examAvailability(
  status: string,
  scheduledStart: string | null,
  scheduledEnd: string | null,
): "available" | "upcoming" | "missed" | "closed" {
  const s = status.toLowerCase();
  if (s === "closed" || s === "completed" || s === "cancelled") return "closed";
  const now = Date.now();
  if (scheduledEnd && new Date(scheduledEnd).getTime() < now) return "missed";
  if (scheduledStart && new Date(scheduledStart).getTime() > now) return "upcoming";
  if (canStartExam(status, scheduledStart, scheduledEnd)) return "available";
  return "closed";
}

export function formatExamWindow(start: string | null, end: string | null): string {
  if (!start && !end) return "Open when approved";
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}
