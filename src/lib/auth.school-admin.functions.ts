import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

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
    let emailSent = false;
    let emailError: string | null = null;

    if (data.decision === "approved") {
      if (app.status === "approved") {
        throw new Error("This application was already approved.");
      }

      const { data: code } = await supabaseAdmin.rpc("generate_school_code", {
        _name: app.school_name,
      });
      schoolCode = code as string;

      const docs = (app.documents ?? {}) as { logo_url?: string };
      const logoUrl = typeof docs.logo_url === "string" && docs.logo_url ? docs.logo_url : null;

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
          logo_url: logoUrl,
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
        message: `Congratulations! Your school space is ready. School code: ${schoolCode}. Check your email for full login details.`,
        type: "success",
      });

      // Email the applicant with full credentials
      try {
        const { sendSchoolApprovalEmail } = await import("@/lib/email.server");
        const mail = await sendSchoolApprovalEmail({
          to: String(app.applicant_email),
          applicantName: String(app.applicant_name || "School Admin"),
          schoolName: String(app.school_name),
          schoolCode: String(schoolCode),
          adminEmail: String(adminEmail),
          adminPassword: String(adminPassword),
          officialEmail: app.official_email ? String(app.official_email) : null,
          phone: app.applicant_phone ? String(app.applicant_phone) : null,
        });
        emailSent = mail.ok;
        if (!mail.ok) emailError = mail.error;
      } catch (e) {
        emailError = e instanceof Error ? e.message : "Email failed";
        console.error("[approve] email exception:", emailError);
      }

      await supabaseAdmin.from("audit_logs").insert({
        school_id: school.id,
        actor_user_id: context.userId,
        actor_role: "super_admin",
        action: "school_approved",
        entity_type: "school",
        entity_id: school.id,
        description: `Approved ${app.school_name} (${schoolCode}); credentials email ${emailSent ? "sent" : "failed"}`,
        metadata: {
          profile_id: profile?.id ?? null,
          logo_url: logoUrl,
          email_sent: emailSent,
          email_error: emailError,
        },
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
      emailSent,
      emailError,
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

const importRowSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().max(255).optional().default(""),
  identifier: z.string().trim().min(1).max(60),
  matricNumber: z.string().trim().max(60).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  facultyId: z.string().uuid().optional().nullable(),
  levelId: z.string().uuid().optional().nullable(),
  rowNumber: z.number().int().positive().optional(),
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

    const { createPerson } = await import("@/lib/users.server");
    const result = await createPerson(schoolId, data, { db: context.supabase as never });

    try {
      await context.supabase.from("audit_logs").insert({
        school_id: schoolId,
        actor_user_id: context.userId,
        actor_role: "school_admin",
        action: `${data.role}_${result.action ?? "created"}`,
        entity_type: data.role,
        entity_id: result.id ?? null,
        description: `${data.firstName} ${data.lastName} (${data.identifier})`,
      } as never);
    } catch {
      /* audit must never block staff creation */
    }

    return result;
  });

export const importStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ rows: z.array(importRowSchema).min(1).max(2000) }).parse(data),
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

    const { upsertStudent } = await import("@/lib/users.server");

    let created = 0;
    let updated = 0;
    const failures: {
      rowNumber?: number;
      name: string;
      identifier: string;
      matricNumber: string;
      reason: string;
    }[] = [];

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const rowNumber = row.rowNumber ?? i + 2;
      const name = `${row.firstName} ${row.lastName}`.trim();
      const matric = (row.matricNumber || row.identifier || "").trim();

      try {
        if (!row.firstName?.trim()) {
          throw new Error("First name is required");
        }
        if (!matric || matric.length < 4) {
          throw new Error("Matric / student ID must be at least 4 characters");
        }

        let email = (row.email || "").trim().toLowerCase();
        if (email && !looksLikeEmail(email)) {
          email = "";
        }

        const person = await upsertStudent(schoolId, {
          role: "student",
          firstName: row.firstName.trim(),
          lastName: (row.lastName || "Student").trim(),
          email: email || `${matric.replace(/[^a-z0-9]+/gi, ".").toLowerCase()}@placeholder.local`,
          identifier: row.identifier.trim() || matric,
          matricNumber: matric,
          departmentId: row.departmentId ?? null,
          facultyId: row.facultyId ?? null,
          levelId: row.levelId ?? null,
        });

        if (person.action === "updated") updated += 1;
        else created += 1;
      } catch (e) {
        failures.push({
          rowNumber,
          name,
          identifier: row.identifier || matric,
          matricNumber: matric,
          reason: (e as Error).message || "Unknown error",
        });
      }
    }

    try {
      await context.supabase.from("audit_logs").insert({
        school_id: schoolId,
        actor_user_id: context.userId,
        actor_role: "school_admin",
        action: "students_imported",
        entity_type: "student",
        description: `Imported students: ${created} created, ${updated} updated, ${failures.length} failed`,
      } as never);
    } catch {
      /* ignore */
    }

    return { created, updated, failed: failures.length, failures };
  });
