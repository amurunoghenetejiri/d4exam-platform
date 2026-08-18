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
    const first = want[0]!;
    const last = want[want.length - 1]!;
    if (tokenHit(first) && tokenHit(last)) return true;
  }
  if (normalizeName(fullName || "") === normalizeName(identifier)) return true;
  return false;
}

function normalizeMatric(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matricMatches(stored: string, password: string) {
  const a = normalizeMatric(stored);
  const b = normalizeMatric(password);
  return a.length > 0 && a === b;
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

const STUDENT_COLS = "id, student_id, matric_number, full_name, status, profile_id";

/**
 * Student is on Admin → Students with matric + full name.
 * Login: school code + (name OR matric) + password = exact matric (same as on the student record).
 * Provisions auth user once; password always kept aligned with matric.
 */
export async function provisionStudentLogin(params: {
  schoolId: string;
  schoolCode: string;
  identifier: string;
  password: string;
}): Promise<ProvisionResult> {
  if (!hasAdminKey()) {
    return {
      error:
        "Could not prepare student login. Ensure SUPABASE_SERVICE_ROLE_KEY is set on the server.",
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const schoolId = params.schoolId;
  const schoolCode = params.schoolCode.trim();
  const identifier = params.identifier.trim();
  const password = params.password.trim();

  if (!identifier || !password) return null;

  // Prefer exact matric / student_id match
  let student: StudentLookupRow | null = null;

  const { data: byId } = await supabaseAdmin
    .from("students")
    .select(STUDENT_COLS)
    .eq("school_id", schoolId)
    .or(`matric_number.ilike.${identifier},student_id.ilike.${identifier}`)
    .limit(10);

  student =
    ((byId ?? []) as StudentLookupRow[]).find(
      (s) =>
        (s.matric_number || "").trim().toLowerCase() === identifier.toLowerCase() ||
        (s.student_id || "").trim().toLowerCase() === identifier.toLowerCase(),
    ) ?? null;

  // Name-based when identifier is a person name
  if (!student && nameTokens(identifier).length >= 1) {
    const { data: list } = await supabaseAdmin
      .from("students")
      .select(STUDENT_COLS)
      .eq("school_id", schoolId)
      .limit(500);
    const matches = ((list ?? []) as StudentLookupRow[]).filter((s) => nameMatches(s.full_name, identifier));
    if (matches.length === 1) student = matches[0]!;
    else if (matches.length > 1) {
      // Disambiguate by password = matric
      student =
        matches.find(
          (s) =>
            matricMatches(s.matric_number || "", password) ||
            matricMatches(s.student_id || "", password),
        ) ?? null;
    }
  }

  if (!student) return null;
  if (String(student.status || "").toLowerCase() === "suspended") {
    return { error: "This student account is suspended. Contact your school." };
  }

  const matric = (student.matric_number || student.student_id || "").trim();
  if (!matric) return null;

  // Password rule: must equal matric (or student_id)
  if (!matricMatches(matric, password) && !matricMatches(student.student_id || "", password)) {
    return null;
  }

  const email = studentSyntheticEmail(schoolCode, matric);
  const fullName = (student.full_name || identifier).trim();

  let authUserId: string | null = null;
  let profileEmail = email;

  if (student.profile_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, auth_user_id, email")
      .eq("id", student.profile_id)
      .maybeSingle();
    if (profile?.auth_user_id) {
      authUserId = profile.auth_user_id as string;
      profileEmail = (profile.email as string) || email;
      try {
        await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: matric });
      } catch {
        /* ignore */
      }
      return { email: profileEmail, password: matric };
    }
  }

  // Create or find auth user
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: matric,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "student",
      school_code: schoolCode,
    },
  });

  if (createError || !created?.user) {
    // Existing email — try list/find
    const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = (listed?.users ?? []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found) {
      authUserId = found.id;
      await supabaseAdmin.auth.admin.updateUserById(found.id, { password: matric });
      const { data: existingProf } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .eq("auth_user_id", found.id)
        .maybeSingle();
      profileEmail = (existingProf?.email as string) || email;
    } else {
      console.error("[provisionStudentLogin] createUser failed", createError?.message);
      return {
        error:
          createError?.message ??
          "Could not prepare student login. Ensure SUPABASE_SERVICE_ROLE_KEY is set on the server.",
      };
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
    if (pErr || !newProfile) {
      return { error: pErr?.message ?? "Could not create student profile." };
    }
    profileId = newProfile.id as string;
  }

  await supabaseAdmin
    .from("students")
    .update({ profile_id: profileId, status: "active" } as never)
    .eq("id", student.id);

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
    /* never block sign-in */
  }
}
