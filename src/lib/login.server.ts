// Server-only helpers for the login flow.
// These require the service role key and are only used as a fallback when a
// student record exists in the database but has no auth account yet.

export function hasAdminKey() {
  return Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
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

/** Identifier name matches full_name if every entered token appears in the full name. */
function nameMatches(fullName: string | null | undefined, identifier: string): boolean {
  const want = nameTokens(identifier);
  if (want.length === 0) return false;
  const have = nameTokens(fullName || "");
  if (have.length === 0) return false;
  return want.every((w) => have.some((h) => h === w || h.startsWith(w) || w.startsWith(h)));
}

function normalizeMatric(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function matricMatches(stored: string, password: string) {
  return normalizeMatric(stored) === normalizeMatric(password);
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

type StudentLookupRow = {
  id: string;
  student_id: string;
  matric_number: string | null;
  full_name: string | null;
  status: string;
  profile_id: string | null;
};

/**
 * Finds a student who appears on the admin Students list (matric + name),
 * verifies password === matric, and ensures an auth account exists so they
 * can sign in. Re-import must not break login — password is always matric.
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
  if (!ident || !password.trim()) return null;

  let student: StudentLookupRow | null = null;

  // 1) Matric / student_id (identifier can also be the matric)
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

  // 2) Name match — full name, or any subset of name tokens (e.g. first + last)
  if (!student && ident.length >= 2) {
    const tokens = nameTokens(ident);
    const search = tokens[0] ? `%${tokens[0]}%` : `%${ident}%`;
    const { data: byName } = await supabaseAdmin
      .from("students")
      .select("id, student_id, matric_number, full_name, status, profile_id")
      .eq("school_id", schoolId)
      .ilike("full_name", search)
      .limit(40);

    const candidates = ((byName ?? []) as unknown as StudentLookupRow[]).filter((s) =>
      nameMatches(s.full_name, ident),
    );

    if (candidates.length === 1) {
      student = candidates[0] ?? null;
    } else if (candidates.length > 1) {
      // Disambiguate with matric password
      student =
        candidates.find((s) => {
          const m = (s.matric_number || s.student_id || "").trim();
          return m && matricMatches(m, password);
        }) ?? null;
      if (!student) {
        return {
          error:
            "Several students match that name. Use your full name or matric number with your matric as password.",
        };
      }
    }
  }

  if (!student) return null;

  const st = String(student.status || "").toLowerCase();
  if (st === "suspended" || st === "deactivated" || st === "locked") {
    return { error: "This student account is suspended. Contact your school administrator." };
  }

  const matric = (student.matric_number || student.student_id || "").trim();
  if (!matric || !matricMatches(matric, password)) {
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

  // Always keep auth password = matric so re-import never locks students out
  if (profileEmail && authUserId) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: matric });
    } catch {
      /* sign-in may still work if password was already matric */
    }
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
    const { data: existingProf } = await supabaseAdmin
      .from("profiles")
      .select("auth_user_id, email")
      .eq("email", email)
      .maybeSingle();
    if (existingProf?.auth_user_id) {
      authUserId = existingProf.auth_user_id as string;
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: matric });
      profileEmail = (existingProf.email as string) || email;
    } else {
      // Last resort: find profile linked by student full_name + school synthetic pattern
      return { error: createError?.message ?? "Could not prepare student login." };
    }
  } else {
    authUserId = created.user.id;
    profileEmail = email;
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
        email: profileEmail || email,
        status: "active",
      })
      .select("id")
      .single();
    if (pErr || !newProfile) return { error: pErr?.message ?? "Could not create student profile." };
    profileId = newProfile.id as string;
  }

  // Re-link student row after import (profile_id may have been cleared or duplicated)
  await supabaseAdmin
    .from("students")
    .update({ profile_id: profileId, status: "active" } as never)
    .eq("id", student.id);

  // If import created a second row with same matric, link active ones
  await supabaseAdmin
    .from("students")
    .update({ profile_id: profileId } as never)
    .eq("school_id", schoolId)
    .ilike("matric_number", matric)
    .is("profile_id", null);

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

  return { email: profileEmail || email, password: matric };
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
