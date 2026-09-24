/**
 * Ensures schoolId is present for school-bound roles after login/unlock.
 * Prevents "not linked to a school" on teacher / school admin / officer dashboards.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSessionUser,
  seedLoginSchoolContext,
  readLoginSchoolContext,
  type SessionUser,
} from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export function SchoolSessionBootstrap() {
  const { data: user } = useSessionUser();
  const qc = useQueryClient();
  const tried = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.userId) return;
    if (user.role === "super_admin") return;
    if (user.schoolId) return;

    const key = user.userId;
    if (tried.current === key) return;
    tried.current = key;

    let cancelled = false;
    (async () => {
      try {
        // 1) Login school seed
        const login = readLoginSchoolContext();
        if (login?.schoolId) {
          let schoolName = user.schoolName;
          let schoolCode = login.schoolCode || user.schoolCode;
          let schoolLogoUrl = user.schoolLogoUrl;
          try {
            const { data: school } = await supabase
              .from("schools")
              .select("name, school_code, logo_url")
              .eq("id", login.schoolId)
              .maybeSingle();
            if (school) {
              schoolName = school.name ?? schoolName;
              schoolCode = school.school_code ?? schoolCode;
              schoolLogoUrl = (school.logo_url as string | null) ?? schoolLogoUrl;
            }
          } catch {
            /* ignore */
          }
          if (!cancelled) {
            const next: SessionUser = {
              ...user,
              schoolId: login.schoolId,
              schoolName: schoolName ?? user.schoolName,
              schoolCode: schoolCode ?? user.schoolCode,
              schoolLogoUrl: schoolLogoUrl ?? user.schoolLogoUrl,
            };
            qc.setQueryData(["session-user"], next);
          }
        }

        // 2) Server repair + refresh
        try {
          const { repairMySessionSchool } = await import("@/lib/repair-session-school.functions");
          const fixed = await repairMySessionSchool();
          if (fixed?.schoolId && !cancelled) {
            seedLoginSchoolContext(fixed.schoolId, fixed.schoolCode);
            await qc.invalidateQueries({ queryKey: ["session-user"] });
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, qc]);

  return null;
}
