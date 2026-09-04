import { useQuery } from "@tanstack/react-query";
import { useSessionUser } from "@/lib/session";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { withOfflineCache } from "@/lib/offline-query";
import { OfflineKeys } from "@/lib/offline-cache";

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

export function useStudentContext() {
  const { data: session } = useSessionUser();

  return useQuery({
    queryKey: ["student-context", session?.profileId, session?.schoolId, session?.userId],
    enabled: Boolean(
      session?.userId &&
        (session.role === "student" ||
          (session.roles && session.roles.includes("student")) ||
          session?.schoolId),
    ),
    staleTime: 20_000,
    queryFn: async (): Promise<StudentContext | null> => {
      const uid = session?.userId;
      return withOfflineCache(
        uid,
        OfflineKeys.studentContext,
        async () => {
          try {
            const { getMyStudentContext } = await import("@/lib/student.server");
            const ctx = await getMyStudentContext();
            if (ctx) return ctx;
          } catch (e) {
            console.warn("[student-context] server fn failed", e);
          }
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            if (!uid) return null;
            let profileQ = await supabase
              .from("profiles")
              .select("id, full_name, email, status, school_id")
              .eq("auth_user_id", uid)
              .maybeSingle();
            let profile = profileQ.data;
            if (!profile && session?.profileId) {
              const byId = await supabase
                .from("profiles")
                .select("id, full_name, email, status, school_id")
                .eq("id", session.profileId)
                .maybeSingle();
              profile = byId.data;
            }
            if (!profile) return null;
            const schoolId = (profile.school_id as string) || session?.schoolId || "";
            let studentQ = await supabase
              .from("students")
              .select(
                "id, matric_number, student_id, school_id, profile_id, department_id, level_id, faculty_id, status, full_name, departments(name), faculties(name), levels(name)",
              )
              .eq("profile_id", profile.id)
              .maybeSingle();
            if (studentQ.error && /full_name/i.test(studentQ.error.message)) {
              studentQ = await supabase
                .from("students")
                .select(
                  "id, matric_number, student_id, school_id, profile_id, department_id, level_id, faculty_id, status, departments(name), faculties(name), levels(name)",
                )
                .eq("profile_id", profile.id)
                .maybeSingle();
            }
            let student = studentQ.data as Record<string, unknown> | null;
            if (!student && schoolId) {
              const alt = await supabase
                .from("students")
                .select(
                  "id, matric_number, student_id, school_id, profile_id, department_id, level_id, faculty_id, status, full_name, departments(name), faculties(name), levels(name)",
                )
                .eq("school_id", schoolId)
                .limit(500);
              const rows = (alt.data ?? []) as Record<string, unknown>[];
              student =
                rows.find((r) => String(r.profile_id || "") === String(profile!.id)) ?? null;
            }
            if (!student) return null;
            const departments = student.departments as { name?: string } | null;
            const faculties = student.faculties as { name?: string } | null;
            const levels = student.levels as { name?: string } | null;
            const status = String(student.status || "active");
            const studentId = String(student.id);
            const departmentId = (student.department_id as string | null) ?? null;
            const levelId = (student.level_id as string | null) ?? null;
            // Enrolled courses: student_courses → course_enrollments → dept/level courses
            let courses: StudentCourse[] = [];
            const mapRows = (rows: unknown[]): StudentCourse[] =>
              (rows ?? [])
                .map((row) => {
                  const c = (row as { courses?: { id?: string; code?: string; name?: string } | null })
                    .courses;
                  if (!c?.id) return null;
                  return {
                    id: String(c.id),
                    code: String(c.code || ""),
                    name: String(c.name || ""),
                  };
                })
                .filter(Boolean) as StudentCourse[];
            try {
              const { data: sc } = await supabase
                .from("student_courses")
                .select("course_id, courses(id, code, name)")
                .eq("student_id", studentId)
                .limit(300);
              courses = mapRows(sc ?? []);
            } catch {
              courses = [];
            }
            if (!courses.length) {
              try {
                const { data: en } = await supabase
                  .from("course_enrollments")
                  .select("course_id, courses(id, code, name)")
                  .eq("student_id", studentId)
                  .limit(300);
                courses = mapRows(en ?? []);
              } catch {
                /* ignore */
              }
            }
            if (!courses.length && schoolId && (departmentId || levelId)) {
              try {
                let cq = supabase
                  .from("courses")
                  .select("id, code, name")
                  .eq("school_id", schoolId)
                  .limit(300);
                if (departmentId) cq = cq.eq("department_id", departmentId);
                if (levelId) cq = cq.eq("level_id", levelId);
                const { data: deptCourses } = await cq;
                courses = (deptCourses ?? []).map((c) => ({
                  id: String((c as { id: string }).id),
                  code: String((c as { code?: string }).code || ""),
                  name: String((c as { name?: string }).name || ""),
                }));
              } catch {
                /* ignore */
              }
            }
            const seen = new Set<string>();
            courses = courses.filter((c) => {
              if (seen.has(c.id)) return false;
              seen.add(c.id);
              return true;
            });
            return {
              studentId,
              matric:
                (student.matric_number as string | null) ??
                (student.student_id as string | null) ??
                null,
              schoolId: String(student.school_id || schoolId),
              profileId: String(profile.id),
              fullName:
                (profile.full_name || "").trim() ||
                String((student as { full_name?: string | null }).full_name || "").trim() ||
                String(student.matric_number || ""),
              email: (profile.email as string) || "",
              schoolName: session?.schoolName ?? null,
              departmentId,
              levelId,
              facultyId: (student.faculty_id as string | null) ?? null,
              departmentName: departments?.name ?? null,
              facultyName: faculties?.name ?? null,
              levelName: levels?.name ?? null,
              status,
              isActive: status.toLowerCase() === "active",
              sessionName: null,
              semesterName: null,
              semesterId: null,
              courses,
              courseIds: courses.map((c) => c.id),
            };
          } catch (e) {
            console.warn("[student-context] client fallback failed", e);
            return null;
          }
        },
        { schoolId: session?.schoolId, fallback: null },
      );
    },
  });
}

export function useStudentRealtimeSync(enabled = true) {
  useRealtimeInvalidate(
    "student-context-sync",
    [{ table: "student_courses" }],
    [["student-context"]],
    enabled,
    2500,
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
): "available" | "upcoming" | "ended" | "missed" | "blocked" {
  const s = status.toLowerCase();
  if (s === "closed" || s === "completed" || s === "cancelled") return "ended";
  if (s === "ongoing") return "available";
  if (!["approved", "scheduled", "published"].includes(s)) return "blocked";
  const now = Date.now();
  if (scheduledEnd && new Date(scheduledEnd).getTime() < now) {
    // Window passed without the student finishing → treat as missed for lists.
    return "missed";
  }
  if (scheduledStart && new Date(scheduledStart).getTime() > now) return "upcoming";
  // approved/published with no start, or start already passed and end not passed
  return "available";
}

/** True when the student must not start this exam again (completed attempt or result). */
export function isExamAttemptFinished(
  attemptStatus: string | null | undefined,
  hasResult?: boolean,
): boolean {
  if (hasResult) return true;
  const st = String(attemptStatus || "").toLowerCase();
  return st === "submitted" || st === "terminated" || st === "flagged";
}

export function formatExamWindow(start: string | null, end: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}
