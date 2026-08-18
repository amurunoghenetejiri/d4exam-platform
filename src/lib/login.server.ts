// Server-only helpers for the login flow.
// Service role required to provision auth for students listed under Admin → Students.

export function hasAdminKey() {
  return Boolean(
    (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || process.env["NEXT_PUBLIC_SUPABASE_URL"]) &&
      (process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
        process.env["SUPABASE_SECRET_KEY"] ||
        process.env["SUPABASE_SERVICE_KEY"] ||
        process.env["SB_SERVICE_ROLE_KEY"]),
  );
}

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function nameTokens(s: string) {
  return normalizeName(s)
    .split(" ")
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 2);
}

/** Name match: all entered tokens in full name, OR first+last when 2+ tokens given. */
function nameMatches(fullName: string | null | undefined, identifier: string): boolean {
  const want = nameTokens(identifier);
  if (want.length === 0) return false;
  const have = nameTokens(fullName || "");
  if (have.length === 0) return false;
  const tokenHit = (w: string) => have.some((h) => h === w || h.startsWith(w) || w.startsWith(h));
  if (want.every(tokenHit)) return true;
  if (want.length >= 2) {
    const first = want[0];
    const last = want[want.length - 1];
    if (tokenHit(first) && tokenHit(last)) return true;
  }
  return false;
}

function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function studentSyntheticEmail(schoolId: string, matric: string) {
  const safeMatric = matric.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeSchool = schoolId.replace(/-/g, "").slice(0, 12);
  return `${safeMatric}.${safeSchool}@student.d4exam.local`;
}

export async function writeLoginAudit(params: {
  schoolId: string | null;
  actorUserId: string | null;
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      school_id: params.schoolId,
      actor_user_id: params.actorUserId,
      actor_role: "system",
      action: params.action,
      entity_type: "auth",
      description: params.description,
      metadata: params.metadata ?? null,
    } as never);
  } catch {
    // never block login on audit failure
  }
}

export async function provisionStudentLogin(params: {
  schoolCode: string;
  identifier: string;
  password: string;
}): Promise<{ email: string; password: string } | { error: string } | null> {
  if (!hasAdminKey()) {
    return {
      error:
        "Could not prepare student login. Ensure SUPABASE_SERVICE_ROLE_KEY is set on the server.",
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const code = params.schoolCode.trim().toUpperCase();
  const id = params.identifier.trim();
  const pwd = params.password.trim();

  const { data: school } = await supabaseAdmin
    .from("schools")
    .select("id, school_code")
    .eq("school_code", code)
    .maybeSingle();
  if (!school?.id) return null;

  // Find student by matric / student_id within school
  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, profile_id, matric_number, student_id, full_name, status")
    .eq("school_id", school.id)
    .or(`matric_number.ilike.${id},student_id.ilike.${id}`)
    .limit(5);

  let student =
    (students ?? []).find(
      (s) =>
        (s.matric_number || "").trim().toLowerCase() === id.toLowerCase() ||
        (s.student_id || "").trim().toLowerCase() === id.toLowerCase(),
    ) ?? null;

  // Name-based fallback when identifier looks like a person name
  if (!student && nameTokens(id).length >= 2) {
    const { data: byName } = await supabaseAdmin
      .from("students")
      .select("id, profile_id, matric_number, student_id, full_name, status")
      .eq("school_id", school.id)
      .limit(200);
    student = (byName ?? []).find((s) => nameMatches(s.full_name, id)) ?? null;
  }

  if (!student) return null;
  if (student.status === "suspended") {
    return { error: "This student account is suspended. Contact your school." };
  }

  const matric = (student.matric_number || student.student_id || id).trim();
  // Password must match matric / student ID rule
  if (pwd.toLowerCase() !== matric.toLowerCase() && pwd.toLowerCase() !== (student.student_id || "").toLowerCase()) {
    // Allow full name as identifier with matric as password
    if (pwd.toLowerCase() !== matric.toLowerCase()) {
      return null;
    }
  }

  const email = studentSyntheticEmail(school.id, matric);

  // Ensure auth user exists
  let authUserId: string | null = null;
  if (student.profile_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, auth_user_id, email")
      .eq("id", student.profile_id)
      .maybeSingle();
    authUserId = profile?.auth_user_id ?? null;
  }

  if (!authUserId) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: matric,
      email_confirm: true,
      user_metadata: {
        full_name: student.full_name,
        role: "student",
        school_code: code,
      },
    });
    if (createError || !created.user) {
      // Maybe email already exists
      const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = (listed?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        authUserId = found.id;
        await supabaseAdmin.auth.admin.updateUserById(found.id, { password: matric });
      } else {
        console.error("[provisionStudentLogin] createUser failed", createError?.message);
        return {
          error:
            "Could not prepare student login. Ensure SUPABASE_SERVICE_ROLE_KEY is set on the server.",
        };
      }
    } else {
      authUserId = created.user.id;
    }

    // Ensure profile + role
    if (student.profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ auth_user_id: authUserId, email, updated_at: new Date().toISOString() } as never)
        .eq("id", student.profile_id);
    } else {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .insert({
          auth_user_id: authUserId,
          school_id: school.id,
          full_name: student.full_name,
          email,
          status: "active",
        } as never)
        .select("id")
        .single();
      if (profile?.id) {
        await supabaseAdmin
          .from("students")
          .update({ profile_id: profile.id } as never)
          .eq("id", student.id);
      }
    }

    await supabaseAdmin.from("user_roles").upsert(
      { user_id: authUserId, school_id: school.id, role: "student" } as never,
      { onConflict: "user_id,school_id,role" } as never,
    );
  } else {
    // Keep password aligned with matric for student rule
    try {
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: matric });
    } catch {
      /* ignore */
    }
  }

  return { email, password: matric };
}
