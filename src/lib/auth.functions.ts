import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const loginSchema = z.object({
  schoolCode: z.string().trim().max(32),
  identifier: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(200),
});

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "D4-";
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  out += "!";
  return out;
}

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function studentSyntheticEmail(schoolCode: string, matric: string) {
  const safeMatric = matric.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeCode = schoolCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${safeMatric}@${safeCode || "school"}.student.d4exam.local`;
}

export const signInWithSchoolCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");

    const code = data.schoolCode.toUpperCase();
    const ident = data.identifier.trim();
    const password = data.password;

    let schoolId: string | null = null;
    let schoolCodeResolved = code;
    if (code) {
      const { data: school } = await supabaseAdmin
        .from("schools")
        .select("id, status, school_code")
        .eq("school_code", code)
        .maybeSingle();
      if (school) {
        if (school.status !== "active") {
          return { error: "This school account is not active. Contact D4EXAM support." };
        }
        schoolId = school.id as string;
        schoolCodeResolved = (school.school_code as string) || code;
      }
    }

    // ─── Student path: Username = full name (or matric), Password = matric ───
    if (schoolId) {
      const { data: studentRows } = await supabaseAdmin
        .from("students")
        .select("id, student_id, matric_number, full_name, status, profile_id")
        .eq("school_id", schoolId)
        .limit(2000);

      const wantName = normalizeName(ident);
      const student = (studentRows ?? []).find((s) => {
        const matric = (s.matric_number || s.student_id || "").trim();
        const name = normalizeName(s.full_name || "");
        return (
          normalizeName(matric) === wantName ||
          name === wantName ||
          (name.length > 0 && name.includes(wantName) && wantName.length >= 3)
        );
      });

      if (student) {
        if (student.status === "suspended" || student.status === "deactivated" || student.status === "locked") {
          return { error: "This student account is suspended. Contact your school administrator." };
        }

        const matric = (student.matric_number || student.student_id || "").trim();
        if (!matric || password !== matric) {
          return { error: "Invalid school code, name or matric password." };
        }

        // Ensure auth user + profile + role exist
        let profileEmail: string | null = null;
        let authUserId: string | null = null;

        if (student.profile_id) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, email, auth_user_id, status")
            .eq("id", student.profile_id)
            .maybeSingle();
          if (profile) {
            profileEmail = profile.email as string;
            authUserId = profile.auth_user_id as string;
          }
        }

        if (!profileEmail || !authUserId) {
          const email = studentSyntheticEmail(schoolCodeResolved, matric);
          const fullName = (student.full_name || matric).trim();

          // Try create; if email exists, look up user
          const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: matric,
            email_confirm: true,
            user_metadata: { full_name: fullName, role: "student" },
          });

          if (createError || !created.user) {
            // User may already exist — try list by email
            const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const existing = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
            if (!existing) {
              return { error: createError?.message ?? "Could not prepare student login." };
            }
            authUserId = existing.id;
            // Reset password to matric so login always works
            await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: matric });
          } else {
            authUserId = created.user.id;
          }

          profileEmail = email;

          // Upsert profile
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
            if (pErr || !newProfile) {
              return { error: pErr?.message ?? "Could not create student profile." };
            }
            profileId = newProfile.id as string;
          }

          await supabaseAdmin
            .from("students")
            .update({ profile_id: profileId, status: "active" } as never)
            .eq("id", student.id);

          // Ensure student role
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
        } else {
          // Keep password in sync with matric for structure-imported students
          await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: matric });
        }

        const anon = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: signIn, error } = await anon.auth.signInWithPassword({
          email: profileEmail!,
          password: matric,
        });

        if (error || !signIn.session) {
          return { error: "Invalid school code, name or matric password." };
        }

        await supabaseAdmin.from("audit_logs").insert({
          school_id: schoolId,
          actor_user_id: signIn.user?.id ?? null,
          action: "login",
          entity_type: "student",
          entity_id: student.id,
          description: "Student signed in (name + matric)",
        });

        return {
          session: {
            access_token: signIn.session.access_token,
            refresh_token: signIn.session.refresh_token,
          },
        };
      }
    }

    // ─── Staff / email path (existing behaviour) ───
    const profileQuery = supabaseAdmin
      .from("profiles")
      .select("id, email, status, school_id")
      .ilike("email", ident);
    if (schoolId) profileQuery.eq("school_id", schoolId);
    const { data: byEmail } = await profileQuery.maybeSingle();

    let profileId: string | null = byEmail?.id ?? null;

    if (!profileId && schoolId) {
      const lookups: Array<{ table: "students" | "teachers" | "examination_officers"; cols: string[] }> = [
        { table: "students", cols: ["student_id", "matric_number", "admission_number"] },
        { table: "teachers", cols: ["staff_id"] },
        { table: "examination_officers", cols: ["officer_id"] },
      ];
      for (const l of lookups) {
        const or = l.cols.map((c) => `${c}.eq.${ident}`).join(",");
        const { data: row } = await supabaseAdmin
          .from(l.table)
          .select("profile_id")
          .eq("school_id", schoolId)
          .or(or)
          .maybeSingle();
        if (row?.profile_id) {
          profileId = row.profile_id as string;
          break;
        }
      }
    }

    if (!profileId) return { error: "Invalid school code, identifier or password." };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, status, school_id")
      .eq("id", profileId)
      .maybeSingle();

    if (!profile) return { error: "Invalid school code, identifier or password." };
    if (schoolId && profile.school_id !== schoolId) {
      return { error: "Invalid school code, identifier or password." };
    }
    if (profile.status === "suspended" || profile.status === "deactivated" || profile.status === "locked") {
      return { error: "This account is not permitted to sign in. Contact your school administrator." };
    }

    const anon = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: signIn, error } = await anon.auth.signInWithPassword({
      email: profile.email,
      password: data.password,
    });

    if (error || !signIn.session) {
      return { error: "Invalid school code, identifier or password." };
    }

    if (profile.status !== "active") {
      await supabaseAdmin.from("profiles").update({ status: "active" }).eq("id", profile.id);
    }

    await supabaseAdmin.from("audit_logs").insert({
      school_id: profile.school_id,
      actor_user_id: signIn.user?.id ?? null,
      action: "login",
      entity_type: "profile",
      entity_id: profile.id,
      description: "User signed in",
    });

    return {
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    };
  });

export const reviewSchoolApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "under_review", "more_information_required"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error: appError } = await supabaseAdmin
      .from("school_applications")
      .select("*")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appError || !app) throw new Error("Application not found");

    await supabaseAdmin
      .from("school_applications")
      .update({
        status: data.decision,
        review_notes: data.notes ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.applicationId);

    let schoolCode: string | null = null;
    let adminEmail: string | null = null;
    let adminPassword: string | null = null;

    if (data.decision === "approved") {
      if (app.status === "approved") {
        throw new Error("This application was already approved.");
      }

      const { data: code } = await supabaseAdmin.rpc("generate_school_code", {
        _name: app.school_name,
      });
      schoolCode = code as string;

      const { data: school, error: schoolError } = await supabaseAdmin
        .from("schools")
        .insert({
          name: app.school_name,
          school_code: schoolCode,
          school_type: app.school_type,
          country: app.country,
          state: app.state,
          city: app.city,
          address: app.address,
          official_email: app.official_email,
          official_phone: app.official_phone,
          status: "active",
          approved_at: new Date().toISOString(),
          approved_by: context.userId,
        })
        .select("id")
        .single();
      if (schoolError || !school) throw new Error(schoolError?.message ?? "Could not create school");

      adminPassword = generateTempPassword();
      adminEmail = app.applicant_email;

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: app.applicant_email,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: app.applicant_name,
          role: "school_admin",
          school_code: schoolCode,
        },
      });
      if (createError || !created.user) {
        throw new Error(createError?.message ?? "Could not create school administrator account");
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .insert({
          auth_user_id: created.user.id,
          school_id: school.id,
          full_name: app.applicant_name,
          email: app.applicant_email,
          phone: app.applicant_phone,
          status: "active",
        })
        .select("id")
        .single();

      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: created.user.id, school_id: school.id, role: "school_admin" });

      await supabaseAdmin.from("notifications").insert({
        recipient_user_id: created.user.id,
        school_id: school.id,
        title: "Welcome to D4EXAM",
        message: `Congratulations! Your school space is ready. School code: ${schoolCode}. Sign in at /login with your email and the password shared by the D4EXAM super admin.`,
        type: "success",
      });

      await supabaseAdmin.from("audit_logs").insert({
        school_id: school.id,
        actor_user_id: context.userId,
        actor_role: "super_admin",
        action: "school_approved",
        entity_type: "school",
        entity_id: school.id,
        description: `Approved ${app.school_name} (${schoolCode}) with instant school admin credentials`,
        metadata: { profile_id: profile?.id ?? null },
      });
    } else {
      await supabaseAdmin.from("audit_logs").insert({
        actor_user_id: context.userId,
        actor_role: "super_admin",
        action: `application_${data.decision}`,
        entity_type: "school_application",
        entity_id: app.id,
        description: `Application for ${app.school_name} marked ${data.decision}`,
      });
    }

    return {
      ok: true,
      schoolCode,
      adminEmail,
      adminPassword,
      schoolName: app.school_name as string,
    };
  });

const personSchema = z.object({
  role: z.enum(["student", "teacher", "examination_officer"]),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  identifier: z.string().trim().min(1).max(60),
  matricNumber: z.string().trim().max(60).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  facultyId: z.string().uuid().optional().nullable(),
  levelId: z.string().uuid().optional().nullable(),
});

export const createSchoolUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => personSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: profileRow } = await context.supabase
      .from("profiles")
      .select("school_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const schoolId = profileRow?.school_id;
    if (!schoolId) throw new Error("No school context");

    const { data: canManage } = await context.supabase.rpc("can_manage_school", {
      _school: schoolId,
    });
    if (!canManage) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createPerson } = await import("@/lib/users.server");
    const result = await createPerson(schoolId, data);

    await supabaseAdmin.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      actor_role: "school_admin",
      action: `${data.role}_created`,
      entity_type: data.role,
      entity_id: result.id ?? null,
      description: `${data.firstName} ${data.lastName} (${data.identifier})`,
    });

    return result;
  });

export const importStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ rows: z.array(personSchema.omit({ role: true })).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: profileRow } = await context.supabase
      .from("profiles")
      .select("school_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    const schoolId = profileRow?.school_id;
    if (!schoolId) throw new Error("No school context");

    const { data: canManage } = await context.supabase.rpc("can_manage_school", {
      _school: schoolId,
    });
    if (!canManage) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createPerson } = await import("@/lib/users.server");

    let created = 0;
    const failures: { identifier: string; reason: string }[] = [];
    const credentials: {
      fullName: string;
      identifier: string;
      email: string;
      password: string;
    }[] = [];

    for (const row of data.rows) {
      try {
        const person = await createPerson(schoolId, { ...row, role: "student" as const });
        created += 1;
        credentials.push({
          fullName: person.fullName,
          identifier: person.identifier,
          email: person.email,
          password: person.password,
        });
      } catch (e) {
        failures.push({ identifier: row.identifier, reason: (e as Error).message });
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      actor_role: "school_admin",
      action: "student_import",
      entity_type: "student",
      description: `Imported ${created} of ${data.rows.length} students`,
    });

    return { created, failed: failures.length, failures, credentials };
  });
