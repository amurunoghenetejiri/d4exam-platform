import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";

export type TeacherContext = {
  teacherId: string;
  staffId: string | null;
  schoolId: string;
  profileId: string;
  fullName: string;
  departmentId: string | null;
};

export function useTeacherContext() {
  const { data: session } = useSessionUser();

  return useQuery({
    queryKey: ["teacher-context", session?.profileId, session?.schoolId],
    enabled: Boolean(session?.profileId && session?.schoolId && session.role === "teacher"),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TeacherContext | null> => {
      if (!session?.profileId || !session.schoolId) return null;
      const { data, error } = await supabase
        .from("teachers")
        .select("id, staff_id, school_id, profile_id, full_name, department_id")
        .eq("profile_id", session.profileId)
        .eq("school_id", session.schoolId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        teacherId: data.id as string,
        staffId: (data.staff_id as string | null) ?? null,
        schoolId: data.school_id as string,
        profileId: data.profile_id as string,
        fullName: (data.full_name as string) || session.fullName,
        departmentId: (data.department_id as string | null) ?? null,
      };
    },
  });
}
