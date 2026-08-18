import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** True when Vercel/Lovable has injected a service-role (or alias) key. */
function hasServiceRoleKey(): boolean {
  return Boolean(
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
      process.env["SUPABASE_SECRET_KEY"] ||
      process.env["SUPABASE_SERVICE_KEY"] ||
      process.env["SB_SERVICE_ROLE_KEY"],
  );
}

function publicSupabaseEnv() {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"];
  return { url, key };
}

/**
 * Create an auth user.
 * - Prefer service role (auto-confirms email) when available.
 * - On Lovable Cloud + Vercel, service role is often missing; fall back to public signUp
 *   (works when email confirmation is disabled, which is common for school apps).
 */
async function createAuthUser(opts: {
  email: string;
  password: string;
  fullName: string;
  role: string;
}): Promise<{ id: string }> {
  if (hasServiceRoleKey()) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: opts.email,
      password: opts.password,
      email_confirm: true,
      user_metadata: { full_name: opts.fullName, role: opts.role },
    });
    if (error || !created.user) {
      throw new Error(error?.message ?? "Could not create this user");
    }
    return { id: created.user.id };
  }

  const { url, key } = publicSupabaseEnv();
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / publishable key on the server. Check Vercel env or Lovable .env (VITE_SUPABASE_*).",
    );
  }

  const anon = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await anon.auth.signUp({
    email: opts.email,
    password: opts.password,
    options: {
      data: { full_name: opts.fullName, role: opts.role },
    },
  });

  if (error) {
    const msg = error.message || "Could not create auth user";
    if (/already|registered|exists/i.test(msg)) {
      throw new Error(
        `An account with email ${opts.email} already exists. Use a different email, or delete the existing auth user in Lovable Cloud → Users.`,
      );
    }
    throw new Error(msg);
  }
  if (!data.user?.id) {
    throw new Error(
      "Could not create auth user (no user returned). If email confirmation is required, disable it in Lovable Cloud Auth settings, or connect your own Supabase project and set SUPABASE_SERVICE_ROLE_KEY on Vercel.",
    );
  }
  return { id: data.user.id };
}

async function adminDb(): Promise<SupabaseClient<Database>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<Database>;
}

export interface PersonInput {
  role: "student" | "teacher" | "examination_officer";
  firstName: string;
  lastName: string;
  email: string;
  identifier: string;
  matricNumber?: string | undefined;
  departmentId?: string | null | undefined;
  facultyId?: string | null | undefined;
  levelId?: string | null | undefined;
}

export interface CreatePersonResult {
  id: string;
  email: string;
  password: string;
  identifier: string;
  role: string;
  fullName: string;
  action: "created" | "updated";
}

function studentSyntheticEmail(schoolId: string, matric: string) {
  const safeMatric = matric.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeSchool = schoolId.replace(/-/g, "").slice(0, 12);
  return `${safeMatric}.${safeSchool}@student.d4exam.local`;
}

/**
 * Password rule (simple for schools):
 * - Students: password = matric / student ID (what they already know)
 * - Teachers / officers: password = staff ID / officer ID
 */
export async function createPerson(
  schoolId: string,
  data: PersonInput,
  opts?: { db?: SupabaseClient<Database> },
): Promise<CreatePersonResult> {
  if (data.role === "student") {
    return upsertStudent(schoolId, data);
  }

  const password = data.identifier.trim();
  if (password.length < 4) {
    throw new Error(
      "Identifier (matric/staff ID) must be at least 4 characters — it is also the login password.",
    );
  }

  const fullName = `${data.firstName} ${data.lastName}`.trim();

  const authUser = await createAuthUser({
    email: data.email,
    password,
    fullName,
    role: data.role,
  });

  // Prefer service-role DB writer; otherwise use the signed-in school admin client (RLS).
  const db: SupabaseClient<Database> = hasServiceRoleKey()
    ? await adminDb()
    : (opts?.db as SupabaseClient<Database>);
  if (!db) {
    throw new Error(
      "Cannot write staff records: no service role key and no admin session client. " +
        "On Lovable Cloud, create teacher/officer while signed in as school admin.",
    );
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .insert({
      auth_user_id: authUser.id,
      school_id: schoolId,
      first_name: data.firstName,
      last_name: data.lastName,
      full_name: fullName,
      email: data.email,
      status: "active",
    })
    .select("id")
    .single();
  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Could not create profile");
  }

  const { error: roleErr } = await db
    .from("user_roles")
    .insert({ user_id: authUser.id, school_id: schoolId, role: data.role });
  if (roleErr) throw new Error(roleErr.message);

  if (data.role === "teacher") {
    const { data: row, error } = await db
      .from("teachers")
      .insert({
        profile_id: profile.id,
        school_id: schoolId,
        staff_id: data.identifier,
        department_id: data.departmentId ?? null,
        faculty_id: data.facultyId ?? null,
        employment_status: "active",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: row.id as string,
      email: data.email,
      password,
      identifier: data.identifier,
      role: data.role,
      fullName,
      action: "created",
    };
  }

  const { data: row, error } = await db
    .from("examination_officers")
    .insert({
      profile_id: profile.id,
      school_id: schoolId,
      officer_id: data.identifier,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: row.id as string,
    email: data.email,
    password,
    identifier: data.identifier,
    role: data.role,
    fullName,
    action: "created",
  };
}

/**
 * Upsert a student by school_id + matric_number.
 * - If student exists: UPDATE profile fields only. NEVER touch exams, scores, results, history.
 * - If student has auth: keep the same auth_user_id / password unless no account yet.
 * - If new: create auth + profile + student row once.
 */
export async function upsertStudent(
  schoolId: string,
  data: PersonInput,
): Promise<CreatePersonResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const matric = (data.matricNumber || data.identifier || "").trim();
  const identifier = (data.identifier || matric).trim();
  if (matric.length < 4) {
    throw new Error("Matric / student ID must be at least 4 characters.");
  }

  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const emailRaw = (data.email || "").trim().toLowerCase();
  const email =
    emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)
      ? emailRaw
      : studentSyntheticEmail(schoolId, matric);

  // Find existing by matric (case-insensitive) within this school only
  const { data: existingList, error: findErr } = await supabaseAdmin
    .from("students")
    .select("id, profile_id, student_id, matric_number, full_name, status")
    .eq("school_id", schoolId)
    .or(`matric_number.ilike.${matric},student_id.ilike.${identifier}`)
    .limit(5);

  if (findErr) throw new Error(findErr.message);

  const existing =
    (existingList ?? []).find(
      (s) =>
        (s.matric_number || "").trim().toLowerCase() === matric.toLowerCase() ||
        (s.student_id || "").trim().toLowerCase() === identifier.toLowerCase(),
    ) ?? null;

  if (existing) {
    // UPDATE only — never delete, never reset exams/results
    const updatePayload: Record<string, unknown> = {
      full_name: fullName,
      student_id: identifier,
      matric_number: matric,
      status: existing.status === "suspended" ? "suspended" : "active",
      updated_at: new Date().toISOString(),
    };
    if (data.facultyId) updatePayload.faculty_id = data.facultyId;
    if (data.departmentId) updatePayload.department_id = data.departmentId;
    if (data.levelId) updatePayload.level_id = data.levelId;

    const { error: upStu } = await supabaseAdmin
      .from("students")
      .update(updatePayload as never)
      .eq("id", existing.id)
      .eq("school_id", schoolId);
    if (upStu) throw new Error(upStu.message);

    if (existing.profile_id) {
      await supabaseAdmin
        .from("profiles")
        .update({
          first_name: data.firstName,
          last_name: data.lastName,
          full_name: fullName,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", existing.profile_id);
    }

    return {
      id: existing.id as string,
      email,
      password: matric,
      identifier,
      role: "student",
      fullName,
      action: "updated",
    };
  }

  // New student — need auth user
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: matric,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "student" },
  });

  let authUserId: string | null = created?.user?.id ?? null;
  if (createError || !authUserId) {
    const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = (listed?.users ?? []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found) {
      authUserId = found.id;
      try {
        await supabaseAdmin.auth.admin.updateUserById(found.id, { password: matric });
      } catch {
        /* ignore */
      }
    } else {
      throw new Error(createError?.message ?? "Could not create student auth user");
    }
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  let profileId = existingProfile?.id as string | undefined;
  if (!profileId) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        auth_user_id: authUserId,
        school_id: schoolId,
        first_name: data.firstName,
        last_name: data.lastName,
        full_name: fullName,
        email,
        status: "active",
      })
      .select("id")
      .single();
    if (profileError || !profile) throw new Error(profileError?.message ?? "Could not create profile");
    profileId = profile.id as string;
  }

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

  const { data: row, error } = await supabaseAdmin
    .from("students")
    .insert({
      profile_id: profileId,
      school_id: schoolId,
      student_id: identifier,
      matric_number: matric,
      full_name: fullName,
      faculty_id: data.facultyId ?? null,
      department_id: data.departmentId ?? null,
      level_id: data.levelId ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    // race: someone else inserted
    if (/duplicate|unique/i.test(error.message)) {
      const { data: raced } = await supabaseAdmin
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .ilike("matric_number", matric)
        .maybeSingle();
      if (raced?.id) {
        return {
          id: raced.id as string,
          email,
          password: matric,
          identifier,
          role: "student",
          fullName,
          action: "updated",
        };
      }
    }
    throw new Error(error.message);
  }

  return {
    id: row.id as string,
    email,
    password: matric,
    identifier,
    role: "student",
    fullName,
    action: "created",
  };
}
