import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const loginSchema = z.object({
  schoolCode: z.string().trim().max(32).optional().default(""),
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

function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export const signInWithSchoolCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { hasAdminKey, provisionStudentLogin, writeLoginAudit } = await import("@/lib/login.server");

    const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
    const publishableKey =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["SUPABASE_ANON_KEY"] ??
      process.env["VITE_SUPABASE_ANON_KEY"];
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!url || !publishableKey) {
      console.error("[login] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY on the server");
      return { error: "Server is not configured for sign-in. Contact support." };
    }

    const publicClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (publishableKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${publishableKey}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", publishableKey);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const adminClient =
      serviceKey && url
        ? createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;

    const code = (data.schoolCode || "").trim().toUpperCase();
    const ident = data.identifier.trim();
    const password = data.password;
    const genericError =
      "Invalid school code, name/matric or password. Students: school code + your name (or matric) + matric number as password.";

    const platformCodes = new Set(["", "SYSTEM", "D4", "D4EXAM", "PLATFORM", "SUPER"]);
    const isPlatform = platformCodes.has(code);

    // Super admin: email + password, no school code
    if ((!code || isPlatform) && looksLikeEmail(ident)) {
      const { data: signIn, error } = await publicClient.auth.signInWithPassword({
        email: ident.toLowerCase(),
        password,
      });
      if (error || !signIn.session) {
        return { error: "Invalid email or password." };
      }
      await writeLoginAudit({
        schoolId: null,
        userId: signIn.user?.id ?? null,
        description: "Super admin / platform sign-in",
      });
      return {
        session: {
          access_token: signIn.session.access_token,
          refresh_token: signIn.session.refresh_token,
        },
      };
    }

    if (!code) {
      return {
        error:
          "Enter your school code (students / school staff) or leave it blank and use your email for super admin.",
      };
    }

    if (!hasAdminKey() || !adminClient) {
      console.error("[login] SUPABASE_SERVICE_ROLE_KEY missing — student login cannot provision.");
      return {
        error:
          "Student sign-in is not fully configured (missing SUPABASE_SERVICE_ROLE_KEY on the server). Ask the platform admin to set it on Vercel.",
      };
    }

    // Resolve school with SERVICE ROLE (anon is often blocked by RLS)
    const { data: schoolRow, error: schoolErr } = await adminClient
      .from("schools")
      .select("id, status, school_code")
      .ilike("school_code", code)
      .limit(1)
      .maybeSingle();

    if (schoolErr) {
      console.error("[login] school lookup failed:", schoolErr.message);
    }

    if (!schoolRow) {
      return { error: "Invalid school code. Check the code from your school admin." };
    }

    const schoolStatus = String((schoolRow as { status?: string }).status || "").toLowerCase();
    if (schoolStatus && schoolStatus !== "active") {
      return { error: "This school account is not active. Contact D4EXAM support." };
    }

    const schoolId = (schoolRow as { id: string }).id;
    const schoolCode = ((schoolRow as { school_code?: string }).school_code || code) as string;

    let email: string | null = null;
    let signInPassword = password;

    // 1) STUDENT PATH FIRST — name or matric + matric password
    if (!looksLikeEmail(ident)) {
      const provisioned = await provisionStudentLogin({
        schoolId,
        schoolCode,
        identifier: ident,
        password,
      });
      if (provisioned && "error" in provisioned) {
        return { error: provisioned.error };
      }
      if (provisioned && "email" in provisioned) {
        email = provisioned.email;
        signInPassword = provisioned.password;
      }
    }

    // 2) Staff / existing profile via RPC
    if (!email) {
      const { data: resolved, error: rpcError } = await publicClient.rpc("resolve_login_identity", {
        _school_code: code,
        _identifier: ident,
      });
      if (rpcError) {
        console.error("[login] resolve_login_identity failed:", rpcError.message);
      } else {
        const row = Array.isArray(resolved) ? resolved[0] : resolved;
        if (row) {
          if ((row as { kind?: string }).kind === "school_inactive") {
            return { error: "This school account is not active. Contact D4EXAM support." };
          }
          const status = ((row as { account_status?: string | null }).account_status ?? null) as string | null;
          if (status === "suspended" || status === "deactivated" || status === "locked") {
            return {
              error: "This account is not permitted to sign in. Contact your school administrator.",
            };
          }
          email = ((row as { email?: string | null }).email ?? null) as string | null;
        }
      }
    }

    // 3) Raw email identifier
    if (!email && looksLikeEmail(ident)) {
      email = ident.toLowerCase();
    }

    if (!email) {
      return { error: genericError };
    }

    let { data: signIn, error } = await publicClient.auth.signInWithPassword({
      email,
      password: signInPassword,
    });

    // Retry after re-provision (password reset to matric)
    if ((error || !signIn?.session) && !looksLikeEmail(ident)) {
      const provisioned = await provisionStudentLogin({
        schoolId,
        schoolCode,
        identifier: ident,
        password,
      });
      if (provisioned && "email" in provisioned) {
        email = provisioned.email;
        signInPassword = provisioned.password;
        const retry = await publicClient.auth.signInWithPassword({
          email,
          password: signInPassword,
        });
        signIn = retry.data;
        error = retry.error;
      }
    }

    if (error || !signIn?.session) {
      console.error("[login] signIn failed:", error?.message, "email=", email);
      return { error: genericError };
    }

    await writeLoginAudit({
      schoolId,
      userId: signIn.user?.id ?? null,
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
        metadata: { profile_id: profile?.id ?? null, logo_url: logoUrl },
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createPerson } = await import("@/lib/users.server");
    const result = await createPerson(schoolId, data);

    await supabaseAdmin.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      actor_role: "school_admin",
      action: `${data.role}_${result.action ?? "created"}`,
      entity_type: data.role,
      entity_id: result.id ?? null,
      description: `${data.firstName} ${data.lastName} (${data.identifier})`,
    });

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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

    const total = data.rows.length;
    const processed = created + updated;

    await supabaseAdmin.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: context.userId,
      actor_role: "school_admin",
      action: "student_import",
      entity_type: "student",
      description: `CSV import: ${total} rows → ${created} new, ${updated} updated, ${failures.length} invalid`,
      metadata: {
        total,
        created,
        updated,
        failed: failures.length,
      },
    });

    return {
      total,
      created,
      updated,
      failed: failures.length,
      processed,
      failures,
    };
  });
