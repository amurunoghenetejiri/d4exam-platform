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

/** Invites an auth user, creates the profile, the role row and the role record. */
export async function createPerson(schoolId: string, data: PersonInput) {
  const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    data.email,
  );
  if (inviteError || !invited.user) {
    throw new Error(inviteError?.message ?? "Could not invite this user");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert({
      auth_user_id: invited.user.id,
      school_id: schoolId,
      first_name: data.firstName,
      last_name: data.lastName,
      full_name: `${data.firstName} ${data.lastName}`,
      email: data.email,
      status: "invited",
    })
    .select("id")
    .single();
  if (profileError || !profile) throw new Error(profileError?.message ?? "Could not create profile");

  await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: invited.user.id, school_id: schoolId, role: data.role });

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
        status: "invited",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
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
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  }

  const { data: row, error } = await supabaseAdmin
    .from("examination_officers")
    .insert({
      profile_id: profile.id,
      school_id: schoolId,
      officer_id: data.identifier,
      status: "invited",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string };
}
