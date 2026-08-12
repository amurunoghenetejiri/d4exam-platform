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
}

/**
 * Stable password everyone can remember without admin copy-paste:
 * - Students: matric / student ID
 * - Teachers / officers: staff / officer ID
 * Padded if shorter than 6 characters (Auth minimum).
 */
export function stablePasswordFromId(identifier: string) {
  const base = identifier.trim();
  if (base.length >= 6) return base;
  return `${base}@D4Exam`;
}

/** Creates auth user with identifier-based password, profile, role, and role record. */
export async function createPerson(schoolId: string, data: PersonInput): Promise<CreatePersonResult> {
  const password = stablePasswordFromId(data.identifier);
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

  if (data.role === "student") {
    const { data: row, error } = await supabaseAdmin
      .from("students")
      .insert({
        profile_id: profile.id,
        school_id: schoolId,
        student_id: data.identifier,
        matric_number: data.matricNumber ?? data.identifier,
        department_id: data.departmentId ?? null,
        faculty_id: data.facultyId ?? null,
        level_id: data.levelId ?? null,
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
    };
  }

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
  };
}
