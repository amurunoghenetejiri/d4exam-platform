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
    .map((t) => t.replace(/[^a-z0-9']/g, ""))
    .filter((t) => t.length >= 2);
}

/**
 * Flexible name login: student may type any subset of their registered name parts,
 * in any order (first only, last only, first+middle, last+first, full name, etc.).
 * Every entered token must appear in the stored full name (fuzzy startsWith allowed).
 */
function nameMatches(fullName: string | null | undefined, identifier: string): boolean {
  const want = nameTokens(identifier);
  if (want.length === 0) return false;
  const have = nameTokens(fullName || "");
  if (have.length === 0) return false;

  const tokenHit = (w: string) =>
    have.some((h) => h === w || h.startsWith(w) || w.startsWith(h));

  if (want.every(tokenHit)) return true;
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

/** All historical synthetic email formats used across import/login versions. */
export function studentAuthEmailCandidates(opts: {
  schoolId: string;
  schoolCode: string;
  matric: string;
}): string[] {
  const matric = opts.matric.trim();
  const safeMatric = matric.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeMatricDot = matric.toLowerCase().replace(/[^a-z0-9]+/g, ".");
  const safeCode = opts.schoolCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const safeSchool = opts.schoolId.replace(/-/g, "").slice(0, 12);
  const out = [
    // login.server format (school code host)
    `${safeMatric}@${safeCode || "school"}.student.d4exam.local`,
    // users.server / import format (school id host)
    `${safeMatric}.${safeSchool}@student.d4exam.local`,
    // older placeholder formats
    `${safeMatricDot}@placeholder.local`,
    `${safeMatric.replace(/-/g, ".")}@placeholder.local`,
    `${safeMatric}@placeholder.local`,
  ];
  // de-dupe preserve order
  return out.filter((e, i) => e && out.indexOf(e) === i);
}

export function isSyntheticStudentEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const e = email.trim().toLowerCase();
  if (!e) return true;
  return (
    e.endsWith(".student.d4exam.local") ||
    e.endsWith("@placeholder.local") ||
    e.includes(".student.d4exam.local") ||
    e.includes("@student.d4exam.local")
  );
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
 * Login: school code + (any name parts OR matric) + password = exact matric.
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

  let student: StudentLookupRow | null = null;

  // 1) Exact matric / student_id match (in-memory so slashes/spaces never break PostgREST filters)
  {
    const { data: list } = await supabaseAdmin
      .from("students")
      .select(STUDENT_COLS)
      .eq("school_id", schoolId)
      .limit(2000);
    const rows = (list ?? []) as StudentLookupRow[];
    const idNorm = normalizeMatric(identifier);
    const idLower = identifier.toLowerCase();

    student =
      rows.find((s) => {
        const m = (s.matric_number || "").trim();
        const sid = (s.student_id || "").trim();
        return (
          m.toLowerCase() === idLower ||
          sid.toLowerCase() === idLower ||
          (idNorm.length >= 4 && (normalizeMatric(m) === idNorm || normalizeMatric(sid) === idNorm))
        );
      }) ?? null;

    // 2) Name-based match; password must equal that student's matric
    if (!student && nameTokens(identifier).length >= 1) {
      const matches = rows.filter((s) => nameMatches(s.full_name, identifier));
      if (matches.length === 1) {
        student = matches[0]!;
      } else if (matches.length > 1) {
        student =
          matches.find(
            (s) =>
              matricMatches(s.matric_number || "", password) ||
              matricMatches(s.student_id || "", password),
          ) ?? null;
      }
    }

    // 3) Password looks like a matric — find student by password-as-matric, then verify name if provided
    if (!student && normalizeMatric(password).length >= 4) {
      const byPass = rows.filter(
        (s) =>
          matricMatches(s.matric_number || "", password) ||
          matricMatches(s.student_id || "", password),
      );
      if (byPass.length === 1) {
        student = byPass[0]!;
      } else if (byPass.length > 1 && nameTokens(identifier).length >= 1) {
        student = byPass.find((s) => nameMatches(s.full_name, identifier)) ?? null;
      }
    }
  }

  if (!student) return null;
  if (String(student.status || "").toLowerCase() === "suspended") {
    return { error: "This student account is suspended. Contact your school." };
  }

  const matric = (student.matric_number || student.student_id || "").trim();
  if (!matric) return null;

  // Password rule: must equal matric (or student_id) — slash differences ignored
  if (!matricMatches(matric, password) && !matricMatches(student.student_id || "", password)) {
    return null;
  }

  const candidates = studentAuthEmailCandidates({ schoolId, schoolCode, matric });
  const fullName = (student.full_name || identifier).trim();

  let authUserId: string | null = null;
  let workingEmail = candidates[0]!;

  // Prefer linked profile's auth user
  if (student.profile_id) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, auth_user_id, email, full_name")
      .eq("id", student.profile_id)
      .maybeSingle();
    if (profile?.auth_user_id) {
      authUserId = profile.auth_user_id as string;
      const stored = ((profile.email as string) || "").trim().toLowerCase();
      if (stored) workingEmail = stored;
      try {
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: matric,
          email_confirm: true,
        });
      } catch {
        /* ignore */
      }
      // Ensure full_name is stored for list display
      if (fullName && fullName.toLowerCase() !== "student") {
        try {
          await supabaseAdmin
            .from("profiles")
            .update({ full_name: fullName } as never)
            .eq("id", student.profile_id);
          await supabaseAdmin
            .from("students")
            .update({ full_name: fullName } as never)
            .eq("id", student.id);
        } catch {
          /* ignore */
        }
      }
      return { email: workingEmail, password: matric };
    }
  }

  // Search auth users by any known synthetic email
  try {
    for (let page = 1; page <= 8 && !authUserId; page++) {
      const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      const users = listed?.users ?? [];
      const found = users.find((u) => {
        const em = (u.email || "").toLowerCase();
        return candidates.some((c) => c.toLowerCase() === em);
      });
      if (found?.id) {
        authUserId = found.id;
        workingEmail = (found.email || candidates[0]!).toLowerCase();
        break;
      }
      if (users.length < 200) break;
    }
  } catch {
    /* continue to create */
  }

  if (authUserId) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: matric,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "student", school_code: schoolCode },
      });
    } catch {
      /* ignore */
    }
  } else {
    // Create with the import-compatible format first (users.server style)
    const preferred =
      candidates.find((c) => c.includes("@student.d4exam.local") && c.includes(".")) ||
      candidates[0]!;
    workingEmail = preferred;
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: preferred,
      password: matric,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "student",
        school_code: schoolCode,
      },
    });
    if (createError || !created?.user) {
      // Try other candidates
      let createdOk = false;
      for (const em of candidates) {
        if (em === preferred) continue;
        const { data: c2, error: e2 } = await supabaseAdmin.auth.admin.createUser({
          email: em,
          password: matric,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: "student", school_code: schoolCode },
        });
        if (!e2 && c2?.user) {
          authUserId = c2.user.id;
          workingEmail = em;
          createdOk = true;
          break;
        }
      }
      if (!createdOk) {
        console.error("[provisionStudentLogin] createUser failed", createError?.message);
        return {
          error:
            createError?.message ??
            "Could not prepare student login. Ensure SUPABASE_SERVICE_ROLE_KEY is set on the server.",
        };
      }
    } else {
      authUserId = created.user.id;
      workingEmail = preferred;
    }
  }

  if (!authUserId) return { error: "Could not resolve auth user." };

  // Link profile
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
        email: workingEmail,
        status: "active",
      })
      .select("id")
      .single();
    if (pErr || !newProfile) {
      return { error: pErr?.message ?? "Could not create student profile." };
    }
    profileId = newProfile.id as string;
  } else {
    await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName,
        school_id: schoolId,
        email: workingEmail,
        status: "active",
      } as never)
      .eq("id", profileId);
  }

  await supabaseAdmin
    .from("students")
    .update({
      profile_id: profileId,
      status: "active",
      full_name: fullName || undefined,
    } as never)
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

  return { email: workingEmail, password: matric };
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
