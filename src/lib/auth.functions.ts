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

export const loginWithSchoolCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        // Empty allowed for super_admin (email + password only)
        schoolCode: z.string().trim().max(32).optional().default(""),
        identifier: z.string().trim().min(1).max(120),
        password: z.string().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { hasAdminKey, provisionStudentLogin, writeLoginAudit } = await import("@/lib/login.server");
    const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
    const anonKey =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["SUPABASE_ANON_KEY"] ??
      process.env["VITE_SUPABASE_ANON_KEY"];
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!url || !anonKey) {
      console.error("[login] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY on the server");
      return { error: "Server configuration error. Contact support." };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const schoolCode = (data.schoolCode ?? "").trim().toUpperCase();
    const ident = data.identifier.trim();
    const password = data.password;

    // Super admin: no school code (or SUPER / PLATFORM) + email + password
    const isSuperCode =
      schoolCode === "" || schoolCode === "SUPER" || schoolCode === "PLATFORM";
    if (looksLikeEmail(ident) && isSuperCode) {
      const { data: signIn, error } = await client.auth.signInWithPassword({
        email: ident.toLowerCase(),
        password,
      });
      if (error || !signIn.session || !signIn.user) {
        if (schoolCode === "") {
          return {
            error:
              "School code is required for school accounts. Super admins may leave it blank with their platform email.",
          };
        }
        return { error: error?.message ?? "Invalid credentials" };
      }

      // Confirm platform super_admin role (service role if available; else session client)
      let isSuper = false;
      try {
        if (serviceKey) {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: roles } = await admin
            .from("user_roles")
            .select("role")
            .eq("user_id", signIn.user.id);
          isSuper = (roles ?? []).some(
            (r: { role: string }) => String(r.role).toLowerCase() === "super_admin",
          );
        } else {
          const authed = createClient(url, anonKey, {
            global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: roles } = await authed
            .from("user_roles")
            .select("role")
            .eq("user_id", signIn.user.id);
          isSuper = (roles ?? []).some(
            (r: { role: string }) => String(r.role).toLowerCase() === "super_admin",
          );
        }
      } catch {
        isSuper = false;
      }

      if (!isSuper) {
        // Not a super admin — school users must supply a real school code
        if (schoolCode === "") {
          return {
            error:
              "School code is required for school accounts. Enter your institution school code.",
          };
        }
        return { error: "Invalid credentials or not a platform super admin." };
      }

      await writeLoginAudit({
        schoolId: null,
        userId: signIn.user.id,
        description: "Super admin / platform sign-in",
      });
      return {
        session: {
          access_token: signIn.session.access_token,
          refresh_token: signIn.session.refresh_token,
        },
      };
    }

    // School users must provide a school code
    if (!schoolCode) {
      return {
        error:
          "School code is required. Super admins may leave school code blank and sign in with email only.",
      };
    }

    // Resolve school
    const { data: school } = await client
      .from("schools")
      .select("id, school_code, status")
      .eq("school_code", schoolCode)
      .maybeSingle();

    if (!school?.id) {
      return { error: "Invalid school code." };
    }

    const schoolId = school.id as string;

    // Try staff login helpers via RPC (no service role)
    let email = looksLikeEmail(ident) ? ident.toLowerCase() : "";
    let signInPassword = password;
    let resolvedKind: string | null = null;

    if (!email) {
      try {
        const { data: resolved } = await client.rpc("resolve_staff_login" as never, {
          _school_code: schoolCode,
          _identifier: ident,
        } as never);
        const row = Array.isArray(resolved) ? resolved[0] : resolved;
        if (row && typeof row === "object" && "email" in (row as object)) {
          email = String((row as { email: string }).email || "");
          resolvedKind = String((row as { kind?: string }).kind || "staff");
        }
      } catch {
        /* RPC may not exist on all projects */
      }
    }

    // Student provisioning path — only when service role is available
    if (!email && !looksLikeEmail(ident)) {
      if (!hasAdminKey()) {
        console.error("[login] SUPABASE_SERVICE_ROLE_KEY missing — student provisioning skipped.");
      } else {
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
          resolvedKind = "student";
        }
      }
    }

    if (!email) {
      return {
        error:
          "Invalid school code, staff ID/email or password. Teachers: use staff ID or email + your password. Students need SUPABASE_SERVICE_ROLE_KEY on the server if accounts are not provisioned yet.",
      };
    }

    let { data: signIn, error } = await client.auth.signInWithPassword({
      email,
      password: signInPassword,
    });

    // Retry student re-provision (password reset to matric) only with service role
    if ((error || !signIn?.session) && !looksLikeEmail(ident) && hasAdminKey() && schoolId) {
      const provisioned = await provisionStudentLogin({
        schoolId,
        schoolCode,
        identifier: ident,
        password,
      });
      if (provisioned && "email" in provisioned) {
        email = provisioned.email;
        signInPassword = provisioned.password;
        const retry = await client.auth.signInWithPassword({
          email,
          password: signInPassword,
        });
        signIn = retry.data;
        error = retry.error;
      }
    }

    if (error || !signIn?.session) {
      return { error: error?.message ?? "Invalid credentials" };
    }

    await writeLoginAudit({
      schoolId,
      userId: signIn.user?.id ?? null,
      description: resolvedKind ? `User signed in (${resolvedKind})` : "User signed in",
    });

    return {
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    };
  });

/** Alias used by login route — keep in sync with loginWithSchoolCode */
export const signInWithSchoolCode = loginWithSchoolCode;
