/**
 * Repair missing school_id on the signed-in user's profile using service role.
 * Fixes officer/teacher/admin "not linked to a school" after unlock.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RepairSessionSchoolResult = {
  schoolId: string | null;
  schoolName: string | null;
  schoolCode: string | null;
  schoolLogoUrl: string | null;
  roles: string[];
  fullName: string | null;
  profileId: string | null;
};

export const repairMySessionSchool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepairSessionSchoolResult> => {
    const userId = context.userId as string;
    const empty: RepairSessionSchoolResult = {
      schoolId: null,
      schoolName: null,
      schoolCode: null,
      schoolLogoUrl: null,
      roles: [],
      fullName: null,
      profileId: null,
    };
    if (!userId) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!supabaseAdmin) return empty;

    const { data: profileByAuth } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, school_id, email, status")
      .eq("auth_user_id", userId)
      .maybeSingle();
    let profile = profileByAuth;
    if (!profile?.id) {
      const { data: byId } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, school_id, email, status")
        .eq("id", userId)
        .maybeSingle();
      profile = byId;
    }

    const profileId = profile?.id ? String(profile.id) : userId;
    let schoolId = profile?.school_id ? String(profile.school_id) : null;
    const roles = new Set<string>();

    const ids = [...new Set([userId, profileId].filter(Boolean))];

    for (const id of ids) {
      const { data: urs } = await supabaseAdmin
        .from("user_roles")
        .select("role, school_id")
        .eq("user_id", id);
      for (const r of urs ?? []) {
        if (r.role) roles.add(String(r.role));
        if (!schoolId && r.school_id) schoolId = String(r.school_id);
      }
    }

    for (const id of ids) {
      const [{ data: eo }, { data: te }, { data: st }, { data: sa }] = await Promise.all([
        supabaseAdmin
          .from("examination_officers")
          .select("school_id, officer_id")
          .eq("profile_id", id)
          .maybeSingle(),
        supabaseAdmin.from("teachers").select("school_id, staff_id").eq("profile_id", id).maybeSingle(),
        supabaseAdmin
          .from("students")
          .select("school_id, matric_number")
          .eq("profile_id", id)
          .maybeSingle(),
        supabaseAdmin
          .from("school_admins")
          .select("school_id")
          .eq("profile_id", id)
          .maybeSingle()
          .then((r) => r)
          .catch(() => ({ data: null })),
      ]);
      if (eo?.school_id) {
        if (!schoolId) schoolId = String(eo.school_id);
        roles.add("examination_officer");
      }
      if (te?.school_id) {
        if (!schoolId) schoolId = String(te.school_id);
        roles.add("teacher");
      }
      if (st?.school_id) {
        if (!schoolId) schoolId = String(st.school_id);
        roles.add("student");
      }
      if (sa && (sa as { school_id?: string }).school_id) {
        if (!schoolId) schoolId = String((sa as { school_id: string }).school_id);
        roles.add("school_admin");
      }
    }

    // Persist school_id onto profile so future client sessions work
    if (schoolId && profileId) {
      try {
        await supabaseAdmin
          .from("profiles")
          .update({ school_id: schoolId, status: "active" } as never)
          .eq("id", profileId);
      } catch {
        /* ignore */
      }
      // Ensure officer role row exists with school
      if (roles.has("examination_officer")) {
        const { data: existing } = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", profileId)
          .eq("role", "examination_officer")
          .maybeSingle();
        if (!existing) {
          const { data: byAuth } = await supabaseAdmin
            .from("user_roles")
            .select("id")
            .eq("user_id", userId)
            .eq("role", "examination_officer")
            .maybeSingle();
          if (!byAuth) {
            try {
              await supabaseAdmin.from("user_roles").insert({
                user_id: userId,
                school_id: schoolId,
                role: "examination_officer",
              } as never);
            } catch {
              /* ignore */
            }
          }
        } else {
          try {
            await supabaseAdmin
              .from("user_roles")
              .update({ school_id: schoolId } as never)
              .eq("id", (existing as { id: string }).id)
              .is("school_id", null);
          } catch {
            /* ignore */
          }
        }
      }
    }

    let schoolName: string | null = null;
    let schoolCode: string | null = null;
    let schoolLogoUrl: string | null = null;
    if (schoolId) {
      const { data: school } = await supabaseAdmin
        .from("schools")
        .select("name, school_code, logo_url")
        .eq("id", schoolId)
        .maybeSingle();
      schoolName = school?.name ?? null;
      schoolCode = school?.school_code ?? null;
      schoolLogoUrl = (school?.logo_url as string | null) ?? null;
    }

    return {
      schoolId,
      schoolName,
      schoolCode,
      schoolLogoUrl,
      roles: [...roles],
      fullName: (profile?.full_name as string | null) || null,
      profileId,
    };
  });
