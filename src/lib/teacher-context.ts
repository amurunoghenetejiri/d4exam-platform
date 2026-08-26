import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { withOfflineCache } from "@/lib/offline-query";
import { OfflineKeys } from "@/lib/offline-cache";

export type AssignedCourse = {
  id: string;
  code: string;
  name: string;
  credit_units: number;
  status: string;
};

export type TeacherWorkspace = {
  teacherId: string;
  staffId: string;
  schoolId: string;
  profileId: string;
  fullName: string;
  email: string;
  schoolName: string | null;
  courses: AssignedCourse[];
  courseIds: string[];
};

/**
 * Live teacher workspace: only courses assigned by admin via teacher_courses.
 * Local-first offline reads.
 */
export function useTeacherWorkspace() {
  const { data: session } = useSessionUser();

  return useQuery({
    queryKey: ["teacher-workspace", session?.profileId, session?.schoolId, session?.userId],
    enabled: Boolean(session?.profileId && session?.schoolId && session.role === "teacher"),
    staleTime: 5 * 60_000,
    networkMode: "offlineFirst",
    retry: 0,
    queryFn: async (): Promise<TeacherWorkspace | null> => {
      if (!session?.profileId || !session.schoolId) return null;
      const uid = session.userId;

      return withOfflineCache(
        uid,
        OfflineKeys.teacherWorkspace,
        async () => {
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

          const courses: AssignedCourse[] = [];
          for (const row of links ?? []) {
            const c = row.courses as unknown as AssignedCourse | AssignedCourse[] | null;
            const course = Array.isArray(c) ? c[0] : c;
            if (course?.id) courses.push(course);
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
        { schoolId: session.schoolId, fallback: null },
      );
    },
  });
}

export function useTeacherSessionLoading() {
  const session = useSessionUser();
  const workspace = useTeacherWorkspace();
  return session.isLoading || workspace.isLoading;
}
