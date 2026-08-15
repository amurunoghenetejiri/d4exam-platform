// Server-only helpers for the login flow.
// Service role required to provision auth for students listed under Admin → Students.

export function hasAdminKey() {
  return Boolean(
    (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"]) &&
      process.env["SUPABASE_SERVICE_ROLE_KEY"],
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
 * Login: school code + (name OR matric) + password = matric.
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
  const pass = password.trim();
  if (!ident || !pass) return null;

  let student: StudentLookupRow | null = null;

  // 1) Identifier is matric / student_id
  {
    const { data: byMatric } = await supabaseAdmin
      .from("students")
      .select(STUDENT_COLS)
      .eq("school_id", schoolId)
      .ilike("matric_number", ident)
      .limit(5);
    const rows = (byMatric ?? []) as unknown as StudentLookupRow[];
    student =
      rows.find((s) => matricMatches(s.matric_number || s.student_id || "", ident)) ?? rows[0] ?? null;
  }

  if (!student) {
    const { data: bySid } = await supabaseAdmin
      .from("students")
      .select(STUDENT_COLS)
      .eq("school_id", schoolId)
      .ilike("student_id", ident)
      .limit(5);
    const rows = (bySid ?? []) as unknown as StudentLookupRow[];
    student = rows[0] ?? null;
  }

  // 2) Identifier is a name
  if (!student && ident.length >= 2) {
    const tokens = nameTokens(ident);
    const searches = [...new Set([tokens[0], tokens[tokens.length - 1]].filter(Boolean))] as string[];
    const foundRows: StudentLookupRow[] = [];
    for (const tok of searches) {
      const { data: byName } = await supabaseAdmin
        .from("students")
        .select(STUDENT_COLS)
        .eq("school_id", schoolId)
        .ilike("full_name", `%${tok}%`)
        .limit(80);
      for (const r of (byName ?? []) as unknown as StudentLookupRow[]) {
        if (!foundRows.some((x) => x.id === r.id)) foundRows.push(r);
      }
    }

    let candidates = foundRows.filter((s) => nameMatches(s.full_name, ident));

    const withMatric = candidates.filter((s) => {
      const m = (s.matric_number || s.student_id || "").trim();
      return m && matricMatches(m, pass);
    });
    if (withMatric.length >= 1) {
      student = withMatric[0] ?? null;
    } else if (candidates.length === 1) {
      student = candidates[0] ?? null;
    } else if (candidates.length > 1) {
      return {
        error:
          "Several students match that name. Sign in with your matric number as the name field, and matric as password.",
      };
    }
  }

  // 3) Password is the matric — find by password
  if (!student) {
    const { data: byPass } = await supabaseAdmin
      .from("students")
      .select(STUDENT_COLS)
      .eq("school_id", schoolId)
      .ilike("matric_number", pass)
      .limit(20);
    const rows = ((byPass ?? []) as unknown as StudentLookupRow[]).filter((s) =>
      matricMatches(s.matric_number || s.student_id || "", pass),
    );
    if (rows.length === 1) {
      const s = rows[0]!;
      if (
        nameTokens(ident).length === 0 ||
        nameMatches(s.full_name, ident) ||
        matricMatches(s.matric_number || "", ident)
      ) {
        student = s;
      }
    } else if (rows.length > 1) {
      student =
        rows.find((s) => nameMatches(s.full_name, ident)) ??
        rows.find((s) => matricMatches(s.matric_number || "", ident)) ??
        null;
    }
  }

  // 4) Flexible scan (punctuation differences)
  if (!student) {
    const { data: sample } = await supabaseAdmin
      .from("students")
      .select(STUDENT_COLS)
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(800);
    const rows = (sample ?? []) as unknown as StudentLookupRow[];
    const passNorm = normalizeMatric(pass);
    const byMatricFlex = rows.filter((s) => {
      const m = normalizeMatric(s.matric_number || s.student_id || "");
      return m && m === passNorm;
    });
    if (byMatricFlex.length === 1) {
      student = byMatricFlex[0] ?? null;
    } else if (byMatricFlex.length > 1) {
      student =
        byMatricFlex.find((s) => nameMatches(s.full_name, ident)) ?? byMatricFlex[0] ?? null;
    } else {
      const byNm = rows.filter((s) => nameMatches(s.full_name, ident));
      if (byNm.length === 1) student = byNm[0] ?? null;
      else if (byNm.length > 1) {
        student =
          byNm.find((s) => matricMatches(s.matric_number || s.student_id || "", pass)) ?? null;
      }
    }
  }

  if (!student) return null;

  const st = String(student.status || "").toLowerCase();
  if (st === "suspended" || st === "deactivated" || st === "locked") {
    return { error: "This student account is suspended. Contact your school administrator." };
  }

  const matric = (student.matric_number || student.student_id || "").trim();
  if (!matric || !matricMatches(matric, pass)) {
    return { error: "Invalid school code, name or matric password. Password must be your matric number." };
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
    try {
      await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: matric });
    } catch {
      /* continue */
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
