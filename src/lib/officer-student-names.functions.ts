/**
 * Resolve student display names for staff (bypasses client RLS gaps).
 * Matches by students.id, profile_id, student_id text, or matric.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResolvedStudentName = {
  full_name: string;
  matric_number: string | null;
  student_id: string | null;
  department_name?: string | null;
  level_name?: string | null;
};

async function assertStaffOfSchool(
  admin: { from: (t: string) => any },
  userId: string,
  schoolId: string,
): Promise<boolean> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, school_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  const pid = profile?.id ? String(profile.id) : null;
  if (profile && String(profile.school_id || "") === schoolId) return true;

  const ids = [userId, pid].filter(Boolean) as string[];
  for (const id of ids) {
    try {
      const [{ data: ur }, { data: eo }, { data: te }, saRes] = await Promise.all([
        admin.from("user_roles").select("id").eq("user_id", id).eq("school_id", schoolId).limit(1),
        admin.from("examination_officers").select("id").eq("profile_id", id).eq("school_id", schoolId).maybeSingle(),
        admin.from("teachers").select("id").eq("profile_id", id).eq("school_id", schoolId).maybeSingle(),
        admin.from("school_admins").select("id").eq("profile_id", id).eq("school_id", schoolId).maybeSingle(),
      ]);
      const sa = (saRes as { data?: { id?: string } | null })?.data;
      if ((ur && ur.length) || eo?.id || te?.id || sa?.id) return true;
    } catch {
      const [{ data: ur }, { data: eo }, { data: te }] = await Promise.all([
        admin.from("user_roles").select("id").eq("user_id", id).eq("school_id", schoolId).limit(1),
        admin.from("examination_officers").select("id").eq("profile_id", id).eq("school_id", schoolId).maybeSingle(),
        admin.from("teachers").select("id").eq("profile_id", id).eq("school_id", schoolId).maybeSingle(),
      ]);
      if ((ur && ur.length) || eo?.id || te?.id) return true;
    }
  }
  // Super admin
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if ((roles ?? []).some((r: { role?: string }) => r.role === "super_admin")) return true;
  return false;
}

export const resolveStudentNamesForOfficer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      data,
      context,
    }: {
      data: { schoolId: string; studentIds: string[] };
      context: { userId: string };
    }): Promise<Record<string, ResolvedStudentName>> => {
      const schoolId = String(data?.schoolId || "").trim();
      const studentIds = [...new Set((data?.studentIds || []).map(String).filter(Boolean))].slice(0, 400);
      if (!schoolId || !studentIds.length) return {};

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const userId = context.userId;

      const ok = await assertStaffOfSchool(supabaseAdmin, userId, schoolId);
      if (!ok) return {};

      const selectCols =
        "id, full_name, matric_number, student_id, profile_id, department_id, level_id, departments(name), levels(name)";

      // A) by uuid id
      const { data: byId } = await supabaseAdmin
        .from("students")
        .select(selectCols)
        .eq("school_id", schoolId)
        .in("id", studentIds);

      // B) by profile_id
      const { data: byProf } = await supabaseAdmin
        .from("students")
        .select(selectCols)
        .eq("school_id", schoolId)
        .in("profile_id", studentIds);

      // C) school-wide slice for matric / student_id text matches
      const { data: schoolSlice } = await supabaseAdmin
        .from("students")
        .select(selectCols)
        .eq("school_id", schoolId)
        .limit(1500);

      type Raw = {
        id: string;
        full_name?: string | null;
        matric_number?: string | null;
        student_id?: string | null;
        profile_id?: string | null;
        department_id?: string | null;
        level_id?: string | null;
        departments?: { name?: string } | null;
        levels?: { name?: string } | null;
      };

      const pool = new Map<string, Raw>();
      for (const s of [...(byId ?? []), ...(byProf ?? []), ...(schoolSlice ?? [])] as Raw[]) {
        pool.set(String(s.id), s);
      }

      const out: Record<string, ResolvedStudentName> = {};
      const needProfiles: { key: string; profileId: string }[] = [];

      function put(key: string, s: Raw) {
        const fn = String(s.full_name || "").trim();
        const entry: ResolvedStudentName = {
          full_name: fn,
          matric_number: s.matric_number ?? null,
          student_id: s.student_id ?? null,
          department_name: s.departments?.name ?? null,
          level_name: s.levels?.name ?? null,
        };
        out[key] = entry;
        out[String(s.id)] = entry;
        if (s.profile_id) out[String(s.profile_id)] = entry;
        if (s.student_id) out[String(s.student_id)] = entry;
        if (s.matric_number) out[String(s.matric_number)] = entry;
        if (!fn && s.profile_id) needProfiles.push({ key, profileId: String(s.profile_id) });
      }

      for (const id of studentIds) {
        const direct = pool.get(id);
        if (direct) {
          put(id, direct);
          continue;
        }
        // profile_id match
        let hit: Raw | undefined;
        for (const s of pool.values()) {
          if (String(s.profile_id || "") === id) {
            hit = s;
            break;
          }
          if (String(s.student_id || "") === id || String(s.matric_number || "") === id) {
            hit = s;
            break;
          }
        }
        if (hit) put(id, hit);
      }

      if (needProfiles.length) {
        const pids = [...new Set(needProfiles.map((x) => x.profileId))];
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .in("id", pids.slice(0, 300));
        const pmap = new Map((profiles ?? []).map((p: { id: string; full_name?: string | null }) => [p.id, String(p.full_name || "").trim()]));
        for (const { key, profileId } of needProfiles) {
          const n = pmap.get(profileId);
          if (n && out[key]) out[key] = { ...out[key], full_name: n };
        }
      }

      return out;
    },
  );
