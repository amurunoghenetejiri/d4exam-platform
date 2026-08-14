// Server-only helpers for the login flow.
// These require the service role key and are only used as a fallback when a
// student record exists in the database but has no auth account yet.

export function hasAdminKey() {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function studentSyntheticEmail(schoolCode: string, matric: string) {
  const safeMatric = matric.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeCode = schoolCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${safeMatric}@${safeCode || "school"}.student.d4exam.local`;
}

export type ProvisionResult =
  | { email: string; password: string }
  | { error: string }
  | null;

/**
 * Finds a student by matric / student_id (indexed) — NEVER loads entire school roster.
 */
export async function provisionStudentLogin(params: {
  schoolId: string;
  schoolCode: string;
  identifier: string;
  password: string;
}): Promise<ProvisionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { schoolId, schoolCode, identifier, password } = params;
  const ident = identifier.trim();

  // Targeted lookup — was .limit(2000) full table scan in memory (multi-second)
  type StudentLookupRow = {
    id: string;
    student_id: string;
    matric_number: string | null;
    full_name: string | null;
    status: string;
    profile_id: string | null;
  };
  let student: StudentLookupRow | null = null;

  const { data: byMatric } = await supabaseAdmin
    .from("students")
    .select("id, student_id, matric_number, full_name, status, profile_id")
    .eq("school_id", schoolId)
    .ilike("matric_number", ident)
    .limit(1)
    .maybeSingle();

  if (byMatric) {
    student = byMatric as unknown as StudentLookupRow;
  } else {
    const { data: bySid } = await supabaseAdmin
      .from("students")
      .select("id, student_id, matric_number, full_name, status, profile_id")
      .eq("school_id", schoolId)
      .ilike("student_id", ident)
      .limit(1)
      .maybeSingle();
    student = (bySid as unknown as StudentLookupRow | null) ?? null;
  }

  // Optional name match only if identifier looks like a name (has space)
  if (!student && ident.includes(" ") && ident.length >= 3) {
    const { data: byName } = await supabaseAdmin
      .from("students")
      .select("id, student_id, matric_number, full_name, status, profile_id")
      .eq("school_id", schoolId)
      .ilike("full_name", ident)
      .limit(3);
    const want = normalizeName(ident);
    student =
      ((byName ?? []) as unknown as StudentLookupRow[]).find(
        (s) => normalizeName(s.full_name || "") === want,
      ) ?? null;
  }

  if (!student) return null;

  if (student.status === "suspended" || student.status === "deactivated" || student.status === "locked") {
    return { error: "This student account is suspended. Contact your school administrator." };
  }

  const matric = (student.matric_number || student.student_id || "").trim();
  if (!matric || password !== matric) {
    return { error: "Invalid school code, name or matric password." };
  }

  let profileEmail: string | null = null;
  let authUserId: string | null = null;

  if (student.profile_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, auth_user_id")
      .eq("id", student.profile_id)
      .maybeSingle();
    if (profile) {
      profileEmail = profile.email as string;
      authUserId = profile.auth_user_id as string;
    }
  }

  if (profileEmail && authUserId) {
    // Do NOT reset password on every login — was forcing updateUserById each time
    return { email: profileEmail, password: matric };
  }

  const email = studentSyntheticEmail(schoolCode, matric);
  const fullName = (student.full_name || matric).trim();

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: matric,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "student" },
  });

  if (createError || !created?.user) {
    // Prefer getUserByEmail over listUsers({ perPage: 1000 }) which scanned all auth users
    try {
      const { data: byEmail } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });
      void byEmail;
    } catch {
      /* ignore */
    }
    // Lookup via profiles table (indexed) instead of auth listUsers
    const { data: existingProf } = await supabaseAdmin
      .from("profiles")
      .select("auth_user_id, email")
      .eq("email", email)
      .maybeSingle();
    if (existingProf?.auth_user_id) {
      authUserId = existingProf.auth_user_id as string;
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: matric });
    } else {
      return { error: createError?.message ?? "Could not prepare student login." };
    }
  } else {
    authUserId = created.user.id;
  }

  if (!authUserId) return { error: "Could not resolve auth user." };

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  let profileId = existingProfile?.id as string | undefined;
  if (!profileId) {
    const { data: newProfile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .insert({
        auth_user_id: authUserId,
        school_id: schoolId,
        full_name: fullName,
        email,
        status: "active",
      })
      .select("id")
      .single();
    if (pErr || !newProfile) return { error: pErr?.message ?? "Could not create student profile." };
    profileId = newProfile.id as string;
  }

  await supabaseAdmin
    .from("students")
    .update({ profile_id: profileId, status: "active" } as never)
    .eq("id", student.id);

  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", authUserId)
    .eq("role", "student")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!roleRow) {
    await supabaseAdmin.from("user_roles").insert({
      user_id: authUserId,
      school_id: schoolId,
      role: "student",
    });
  }

  return { email, password: matric };
}

export async function writeLoginAudit(params: {
  schoolId: string | null;
  userId: string | null;
  description: string;
}) {
  try {
    if (!hasAdminKey()) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      school_id: params.schoolId,
      actor_user_id: params.userId,
      action: "login",
      entity_type: "profile",
      entity_id: null,
      description: params.description,
    } as never);
  } catch {
    /* auditing must never block sign-in */
  }
}
