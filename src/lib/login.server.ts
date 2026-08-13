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
 * Finds a student by name / matric inside a school and makes sure an auth
 * account, profile and role row exist. Returns the credentials to sign in with.
 */
export async function provisionStudentLogin(params: {
  schoolId: string;
  schoolCode: string;
  identifier: string;
  password: string;
}): Promise<ProvisionResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { schoolId, schoolCode, identifier, password } = params;

  const { data: studentRows } = await supabaseAdmin
    .from("students")
    .select("id, student_id, matric_number, full_name, status, profile_id")
    .eq("school_id", schoolId)
    .limit(2000);

  const wantName = normalizeName(identifier);
  const student = (studentRows ?? []).find((s) => {
    const matric = (s.matric_number || s.student_id || "").trim();
    const name = normalizeName(s.full_name || "");
    return (
      normalizeName(matric) === wantName ||
      name === wantName ||
      (name.length > 0 && name.includes(wantName) && wantName.length >= 3)
    );
  });

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
    await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: matric });
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
    const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) return { error: createError?.message ?? "Could not prepare student login." };
    authUserId = existing.id;
    await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: matric });
  } else {
    authUserId = created.user.id;
  }

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
