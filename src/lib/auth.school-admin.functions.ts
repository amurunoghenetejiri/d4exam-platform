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

    if (data.decision !== "approved") {
      await supabaseAdmin
        .from("school_applications")
        .update({
          status: data.decision,
          review_notes: data.notes ?? null,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.applicationId);

      await supabaseAdmin.from("audit_logs").insert({
        actor_user_id: context.userId,
        actor_role: "super_admin",
        action: `application_${data.decision}`,
        entity_type: "school_application",
        entity_id: app.id,
        description: `Application for ${app.school_name} marked ${data.decision}`,
      });

      return {
        ok: true,
        schoolCode: null,
        adminEmail: null,
        adminPassword: null,
        schoolName: app.school_name as string,
        emailSent: false,
        emailError: null,
      };
    }

    let schoolCode: string | null = null;
    let adminEmail: string = String(app.applicant_email || "").trim().toLowerCase();
    let adminPassword = generateTempPassword();
    let emailSent = false;
    let emailError: string | null = null;
    let schoolId: string | null = null;

    if (!adminEmail) throw new Error("Application is missing applicant email.");

    const docs = (app.documents ?? {}) as { logo_url?: string };
    const logoUrl = typeof docs.logo_url === "string" && docs.logo_url ? docs.logo_url : null;

    {
      const { data: byEmail } = await supabaseAdmin
        .from("schools")
        .select("id, school_code, name")
        .eq("official_email", app.official_email)
        .maybeSingle();
      if (byEmail?.id) {
        schoolId = byEmail.id as string;
        schoolCode = (byEmail.school_code as string) || null;
      }
    }
    if (!schoolId) {
      const { data: byName } = await supabaseAdmin
        .from("schools")
        .select("id, school_code, name")
        .ilike("name", String(app.school_name))
        .limit(1)
        .maybeSingle();
      if (byName?.id) {
        schoolId = byName.id as string;
        schoolCode = (byName.school_code as string) || null;
      }
    }

    if (!schoolCode) {
      try {
        const { data: code } = await supabaseAdmin.rpc("generate_school_code", {
          _name: app.school_name,
        });
        schoolCode = (code as string) || null;
      } catch {
        schoolCode = null;
      }
      if (!schoolCode) {
        const base =
          String(app.school_name || "SCH")
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 6)
            .toUpperCase() || "SCH";
        schoolCode = `${base}${Math.floor(100 + Math.random() * 900)}`;
      }
    }

    if (!schoolId) {
      let lastErr: string | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const codeTry =
          attempt === 0
            ? schoolCode
            : `${String(schoolCode).replace(/\d+$/, "")}${Math.floor(100 + Math.random() * 900)}`;
        const { data: school, error: schoolError } = await supabaseAdmin
          .from("schools")
          .insert({
            name: app.school_name,
            school_code: codeTry,
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
          .select("id, school_code")
          .single();
        if (!schoolError && school) {
          schoolId = school.id as string;
          schoolCode = (school.school_code as string) || codeTry;
          break;
        }
        lastErr = schoolError?.message ?? "Could not create school";
        if (!/duplicate|unique|already exists/i.test(lastErr)) {
          throw new Error(lastErr);
        }
      }
      if (!schoolId) throw new Error(lastErr ?? "Could not create school");
    }

    let userId: string | null = null;
    {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: app.applicant_name,
          role: "school_admin",
          school_code: schoolCode,
        },
      });
      if (!createError && created?.user) {
        userId = created.user.id;
      } else {
        const msg = createError?.message || "";
        if (/already|registered|exists/i.test(msg) || !created?.user) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("auth_user_id, id")
            .eq("email", adminEmail)
            .maybeSingle();
          if (prof?.auth_user_id) {
            userId = prof.auth_user_id as string;
          } else {
            const { data: listed } = await supabaseAdmin.auth.admin.listUsers({
              page: 1,
              perPage: 200,
            });
            const found = (listed?.users ?? []).find(
              (u) => (u.email || "").toLowerCase() === adminEmail,
            );
            if (found) userId = found.id;
          }
          if (!userId) {
            throw new Error(
              msg ||
                "Could not create school administrator account. The email may already be in use.",
            );
          }
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: adminPassword,
            email_confirm: true,
            user_metadata: {
              full_name: app.applicant_name,
              role: "school_admin",
              school_code: schoolCode,
            },
          });
          if (updErr) throw new Error(updErr.message);
        } else {
          throw new Error(msg || "Could not create school administrator account");
        }
      }
    }

    {
      const { data: existingProf } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .or(`auth_user_id.eq.${userId},email.eq.${adminEmail}`)
        .limit(1)
        .maybeSingle();

      if (existingProf?.id) {
        await supabaseAdmin
          .from("profiles")
          .update({
            auth_user_id: userId,
            school_id: schoolId,
            full_name: app.applicant_name,
            email: adminEmail,
            phone: app.applicant_phone,
            status: "active",
          })
          .eq("id", existingProf.id);
      } else {
        await supabaseAdmin.from("profiles").insert({
          id: userId,
          auth_user_id: userId,
          school_id: schoolId,
          full_name: app.applicant_name,
          email: adminEmail,
          phone: app.applicant_phone,
          status: "active",
        });
      }

      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "school_admin")
        .eq("school_id", schoolId)
        .maybeSingle();
      if (!existingRole) {
        await supabaseAdmin.from("user_roles").insert({
          user_id: userId,
          school_id: schoolId,
          role: "school_admin",
        });
      }
    }

    try {
      await supabaseAdmin.from("notifications").insert({
        recipient_user_id: userId,
        school_id: schoolId,
        title: "Welcome to D4EXAM",
        message: `Your school is approved. School code: ${schoolCode}. Sign in with your email and the temporary password from the super admin.`,
        type: "success",
        link: "/login",
      });
    } catch {
      /* ignore */
    }

    try {
      const { sendSchoolApprovalEmail } = await import("@/lib/email.server");
      const mail = await sendSchoolApprovalEmail({
        to: adminEmail,
        applicantName: String(app.applicant_name || "School Admin"),
        schoolName: String(app.school_name),
        schoolCode: String(schoolCode),
        adminEmail,
        adminPassword,
        officialEmail: app.official_email ? String(app.official_email) : null,
        phone: app.applicant_phone ? String(app.applicant_phone) : null,
      });
      emailSent = mail.ok;
      if (!mail.ok) emailError = mail.error;
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Email failed";
    }

    await supabaseAdmin
      .from("school_applications")
      .update({
        status: "approved",
        review_notes: data.notes ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        issued_school_code: schoolCode,
        issued_admin_email: adminEmail,
        issued_admin_password: adminPassword,
      } as never)
      .eq("id", data.applicationId);

    try {
      await supabaseAdmin.from("audit_logs").insert({
        school_id: schoolId,
        actor_user_id: context.userId,
        actor_role: "super_admin",
        action: "school_approved",
        entity_type: "school",
        entity_id: schoolId,
        description: `Approved ${app.school_name} (${schoolCode}); email ${emailSent ? "sent" : "not sent"}`,
        metadata: {
          email_sent: emailSent,
          email_error: emailError,
          applicant_email: adminEmail,
        },
      });
    } catch {
      /* ignore */
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

const importRowSchema = z
  .object({
    firstName: z.string().trim().max(80).optional().default(""),
    lastName: z.string().trim().max(80).optional().default(""),
    email: z.string().trim().max(255).optional().default(""),
    identifier: z.string().trim().max(60).optional().default(""),
    matricNumber: z.string().trim().max(60).optional().default(""),
    departmentId: z.string().uuid().optional().nullable(),
    facultyId: z.string().uuid().optional().nullable(),
    levelId: z.string().uuid().optional().nullable(),
    rowNumber: z.number().int().positive().optional(),
  })
  .transform((row) => {
    const matric = (row.matricNumber || row.identifier || "").trim();
    const identifier = (row.identifier || matric).trim();
    const firstName = (row.firstName || "").trim() || "Student";
    const lastName = (row.lastName || "").trim() || "Student";
    return {
      ...row,
      firstName,
      lastName,
      identifier,
      matricNumber: matric || identifier,
      email: (row.email || "").trim().toLowerCase(),
    };
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
      const matric = (row.matricNumber || row.identifier || "").trim();
      const identifier = (row.identifier || matric).trim();
      const firstName = (row.firstName || "Student").trim() || "Student";
      const lastName = (row.lastName || "Student").trim() || "Student";
      const name = `${firstName} ${lastName}`.trim();

      try {
        if (!identifier) {
          throw new Error("Matric / student ID is required");
        }
        if (identifier.length < 4) {
          throw new Error("Matric / student ID must be at least 4 characters");
        }

        let email = (row.email || "").trim().toLowerCase();
        if (email && !looksLikeEmail(email)) {
          email = "";
        }

        const person = await upsertStudent(schoolId, {
          role: "student",
          firstName,
          lastName,
          email: email || `${identifier.replace(/[^a-z0-9]+/gi, ".").toLowerCase()}@placeholder.local`,
          identifier,
          matricNumber: matric || identifier,
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
          identifier: identifier || matric,
          matricNumber: matric || identifier,
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

    const processed = created + updated;
    return {
      total: data.rows.length,
      created,
      updated,
      failed: failures.length,
      processed,
      failures,
    };
  });
