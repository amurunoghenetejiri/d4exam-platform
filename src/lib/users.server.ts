import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
export async function createPerson(schoolId: string, data: PersonInput): Promise<CreatePersonResult> {
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

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: data.role,
    },
  });
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Could not create this user");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert({
      auth_user_id: created.user.id,
      school_id: schoolId,
      first_name: data.firstName,
      last_name: data.lastName,
      full_name: fullName,
      email: data.email,
      status: "active",
    })
    .select("id")
    .single();
  if (profileError || !profile) throw new Error(profileError?.message ?? "Could not create profile");

  await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: created.user.id, school_id: schoolId, role: data.role });

  if (data.role === "teacher") {
    const { data: row, error } = await supabaseAdmin
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

  const { data: row, error } = await supabaseAdmin
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
          // keep existing email if profile already has a real one
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", existing.profile_id);
    }

    // Ensure auth role still linked — do not create a second auth user
    let profileEmail = email;
    if (existing.profile_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email, auth_user_id")
        .eq("id", existing.profile_id)
        .maybeSingle();
      if (prof?.email) profileEmail = prof.email as string;
      // Do NOT reset password on update — preserves credentials
    }

    return {
      id: existing.id as string,
      email: profileEmail,
      password: matric,
      identifier,
      role: "student",
      fullName,
      action: "updated",
    };
  }

  // NEW student — create auth once
  let authUserId: string | null = null;
  let usedEmail = email;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: matric,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "student",
    },
  });

  if (createError || !created?.user) {
    // Email may already exist (e.g. previous partial import) — link to it
    const msg = (createError?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        authUserId = found.id;
        usedEmail = found.email || email;
        // Keep existing password — do not overwrite unless needed for matric rule
        // Only set password if we know this is a student synthetic account
        if (usedEmail.includes("@student.d4exam.local")) {
          await supabaseAdmin.auth.admin.updateUserById(found.id, { password: matric });
        }
      } else {
        throw new Error(createError?.message ?? "Could not create student auth account");
      }
    } else {
      throw new Error(createError?.message ?? "Could not create student auth account");
    }
  } else {
    authUserId = created.user.id;
  }

  if (!authUserId) throw new Error("Could not resolve student auth user");

  // Profile: reuse if auth already has one
  let profileId: string | null = null;
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existingProfile?.id) {
    profileId = existingProfile.id as string;
    await supabaseAdmin
      .from("profiles")
      .update({
        school_id: schoolId,
        first_name: data.firstName,
        last_name: data.lastName,
        full_name: fullName,
        email: usedEmail,
        status: "active",
      } as never)
      .eq("id", profileId);
  } else {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        auth_user_id: authUserId,
        school_id: schoolId,
        first_name: data.firstName,
        last_name: data.lastName,
        full_name: fullName,
        email: usedEmail,
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
      department_id: data.departmentId ?? null,
      faculty_id: data.facultyId ?? null,
      level_id: data.levelId ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    // Race: unique constraint — treat as update
    if (/unique|duplicate/i.test(error.message)) {
      const { data: raced } = await supabaseAdmin
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .ilike("matric_number", matric)
        .maybeSingle();
      if (raced?.id) {
        await supabaseAdmin
          .from("students")
          .update({
            full_name: fullName,
            student_id: identifier,
            profile_id: profileId,
            faculty_id: data.facultyId ?? null,
            department_id: data.departmentId ?? null,
            level_id: data.levelId ?? null,
          } as never)
          .eq("id", raced.id);
        return {
          id: raced.id as string,
          email: usedEmail,
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
    email: usedEmail,
    password: matric,
    identifier,
    role: "student",
    fullName,
    action: "created",
  };
}
