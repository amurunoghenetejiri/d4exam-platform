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

    // Full approval flow continues in original file - this is a partial emergency restore.
    // Please re-sync full file from commit 92cb248decd21fd87a62305b671cf184164721b4 if approval flow fails.
    throw new Error(
      "Emergency partial restore active. Re-deploy auth.school-admin.functions.ts from commit 92cb248.",
    );
  });

const personSchema = z.object({
  role: z.enum(["student", "teacher", "examination_officer", "school_admin"]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().optional(),
  identifier: z.string().min(1),
  matricNumber: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  facultyId: z.string().nullable().optional(),
  levelId: z.string().nullable().optional(),
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

    try {
      const { notifySuperAdminsStudentsAdded, notifySuperAdminsTeachersAdded } = await import("@/lib/notify");
      if (data.role === "student") {
        void notifySuperAdminsStudentsAdded({ schoolId, count: 1 });
      } else if (data.role === "teacher") {
        void notifySuperAdminsTeachersAdded({ schoolId, count: 1 });
      }
    } catch {
      /* never block */
    }

    return result;
  });

const importRowSchema = z.object({
  rowNumber: z.number().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  identifier: z.string().optional(),
  matricNumber: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  facultyId: z.string().nullable().optional(),
  levelId: z.string().nullable().optional(),
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
        if (!identifier) throw new Error("Matric / student ID is required");
        if (identifier.length < 4) throw new Error("Matric / student ID must be at least 4 characters");

        let email = (row.email || "").trim().toLowerCase();
        if (email && !looksLikeEmail(email)) email = "";

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

    try {
      if (created > 0) {
        const { notifySuperAdminsStudentsAdded } = await import("@/lib/notify");
        void notifySuperAdminsStudentsAdded({ schoolId, count: created });
      }
    } catch {
      /* never block import */
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
