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
          // Role may lag one tick after login — still try when school is known
          session?.schoolId),
    ),
    staleTime: 5 * 60_000,
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
          // Client-side fallback using the browser Supabase session
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            if (!uid) return null;
            let profileQ = await supabase
              .from("profiles")
              .select("id, full_name, email, status, school_id")
              .eq("auth_user_id", uid)
              .maybeSingle();
            let profile = profileQ.data;
            if (!profile?.id) {
              profileQ = await supabase
                .from("profiles")
                .select("id, full_name, email, status, school_id")
                .eq("id", uid)
                .maybeSingle();
              profile = profileQ.data;
            }
            if (!profile?.id || !profile.school_id) return null;
            const schoolId = profile.school_id as string;
            const { data: student } = await supabase
              .from("students")
              .select(
                "id, matric_number, student_id, school_id, profile_id, department_id, level_id, faculty_id, status, departments(name), faculties(name), levels(name)",
              )
              .eq("profile_id", profile.id)
              .eq("school_id", schoolId)
              .maybeSingle();
            if (!student) return null;
            const { data: school } = await supabase
              .from("schools")
              .select("name")
              .eq("id", schoolId)
              .maybeSingle();
            const departments = student.departments as { name: string } | null;
            const faculties = student.faculties as { name: string } | null;
            const levels = student.levels as { name: string } | null;
            const status = String(student.status ?? "active");
            return {
              studentId: student.id as string,
              matric:
                (student.matric_number as string | null) ??
                (student.student_id as string | null) ??
                null,
              schoolId,
              profileId: (student.profile_id as string | null) ?? profile.id,
              fullName: (profile.full_name || "").trim() || String(student.matric_number || ""),
              email: profile.email || "",
              schoolName: (school?.name as string | null) ?? null,
              departmentId: (student.department_id as string | null) ?? null,
              levelId: (student.level_id as string | null) ?? null,
              facultyId: (student.faculty_id as string | null) ?? null,
              departmentName: departments?.name ?? null,
              facultyName: faculties?.name ?? null,
              levelName: levels?.name ?? null,
              status,
              isActive: status.toLowerCase() === "active",
              sessionName: null,
              semesterName: null,
              semesterId: null,
              courses: [],
              courseIds: [],
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
): "available" | "upcoming" | "ended" | "blocked" {
  const s = status.toLowerCase();
  if (s === "closed" || s === "completed" || s === "cancelled") return "ended";
  if (s === "ongoing") return "available";
  if (!["approved", "scheduled", "published"].includes(s)) return "blocked";
  const now = Date.now();
  if (scheduledEnd && new Date(scheduledEnd).getTime() < now) return "ended";
  if (scheduledStart && new Date(scheduledStart).getTime() > now) return "upcoming";
  return "available";
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
