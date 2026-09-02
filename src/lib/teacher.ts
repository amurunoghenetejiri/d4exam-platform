import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { withOfflineCache } from "@/lib/offline-query";
import { OfflineKeys } from "@/lib/offline-cache";

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

type TeacherRow = {
  id: string;
  staff_id: string;
  school_id: string;
  profile_id: string | null;
};

/**
 * Resolve the teachers row for the signed-in user.
 * Tries profile_id + school_id, then profile_id only, then auth_user_id → profiles → teachers.
 * No schema changes; pure lookup resilience.
 */
async function resolveTeacherRow(
  profileId: string,
  schoolId: string | null,
  authUserId: string,
): Promise<TeacherRow | null> {
  // 1) Exact match (preferred)
  if (profileId && schoolId) {
    const { data, error } = await supabase
      .from("teachers")
      .select("id, staff_id, school_id, profile_id")
      .eq("profile_id", profileId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (!error && data) return data as TeacherRow;
  }

  // 2) By profile_id only (school may have been missing on session)
  if (profileId) {
    const { data, error } = await supabase
      .from("teachers")
      .select("id, staff_id, school_id, profile_id")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!error && data) return data as TeacherRow;
  }

  // 3) Session profileId may be auth uid — resolve real profiles.id via auth_user_id
  if (authUserId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, school_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (prof?.id && prof.id !== profileId) {
      let q = supabase
        .from("teachers")
        .select("id, staff_id, school_id, profile_id")
        .eq("profile_id", prof.id);
      if (schoolId) q = q.eq("school_id", schoolId);
      const { data, error } = await q.maybeSingle();
      if (!error && data) return data as TeacherRow;
      // last resort: any school for this profile
      if (schoolId) {
        const { data: anySchool } = await supabase
          .from("teachers")
          .select("id, staff_id, school_id, profile_id")
          .eq("profile_id", prof.id)
          .maybeSingle();
        if (anySchool) return anySchool as TeacherRow;
      }
    }
  }

  return null;
}

/**
 * Loads the signed-in teacher record and only courses assigned by admin
 * via teacher_courses. Local-first offline reads.
 */
export function useTeacherContext() {
  const { data: session } = useSessionUser();

  const isTeacher =
    session?.role === "teacher" ||
    (Array.isArray(session?.roles) && session.roles.includes("teacher"));

  return useQuery({
    queryKey: ["teacher-context", session?.profileId, session?.schoolId, session?.userId],
    // Allow load when we have a user + teacher role even if schoolId is still resolving
    enabled: Boolean(session?.userId && session?.profileId && isTeacher),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    networkMode: "offlineFirst",
    retry: 1,
    queryFn: async (): Promise<TeacherContext | null> => {
      if (!session?.profileId || !session.userId) return null;
      const uid = session.userId;
      const profileId: string = session.profileId;
      const schoolId: string | null = session.schoolId;

      return withOfflineCache(
        uid,
        OfflineKeys.teacherContext,
        async () => {
          const teacher = await resolveTeacherRow(profileId, schoolId, uid);
          if (!teacher) return null;

          const effectiveSchoolId = teacher.school_id || schoolId;
          if (!effectiveSchoolId) return null;

          const { data: links, error: lErr } = await supabase
            .from("teacher_courses")
            .select("course_id, courses(id, code, name, credit_units, status)")
            .eq("teacher_id", teacher.id)
            .eq("school_id", effectiveSchoolId);

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
            schoolId: effectiveSchoolId,
            profileId: teacher.profile_id ?? session.profileId,
            fullName: session.fullName,
            email: session.email,
            schoolName: session.schoolName,
            courses,
            courseIds: courses.map((c) => c.id),
          };
        },
        { schoolId: schoolId ?? undefined, fallback: null, localFirst: false },
      );
    },
  });
}
