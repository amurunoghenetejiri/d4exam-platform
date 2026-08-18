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

const loginInputSchema = z.object({
  // Blank allowed for platform super_admin (email + password only).
  // School users must still send a real school code.
  schoolCode: z.preprocess(
    (v) => (v == null ? "" : String(v).trim()),
    z.string().max(32),
  ),
  identifier: z.preprocess(
    (v) => (v == null ? "" : String(v).trim()),
    z.string().min(1).max(120),
  ),
  password: z.preprocess(
    (v) => (v == null ? "" : String(v)),
    z.string().min(1).max(120),
  ),
});

export const loginWithSchoolCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    // TanStack may pass either the payload or { data: payload }
    const raw =
      data &&
      typeof data === "object" &&
      "data" in (data as object) &&
      (data as { data: unknown }).data &&
      typeof (data as { data: unknown }).data === "object"
        ? (data as { data: unknown }).data
        : data;
    return loginInputSchema.parse(raw);
  })
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

    // Super admin: blank school code (or SUPER / PLATFORM) + email + password
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
              "Invalid email or password. School accounts must enter a school code. Super admins leave school code blank.",
          };
        }
        return { error: error?.message ?? "Invalid credentials" };
      }

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
        if (schoolCode === "") {
          return {
            error:
              "School code is required for school accounts. Enter your institution school code.",
          };
        }
        return { error: "Invalid credentials or not a platform super admin." };
      }

      // Ensure role + profile exist (self-heal if SQL was partial)
      if (serviceKey) {
        try {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const uid = signIn.user.id;
          const email = (signIn.user.email || ident).toLowerCase();
          const { data: existingRole } = await admin
            .from("user_roles")
            .select("id")
            .eq("user_id", uid)
            .eq("role", "super_admin")
            .maybeSingle();
          if (!existingRole) {
            await admin.from("user_roles").insert({
              user_id: uid,
              role: "super_admin",
              school_id: null,
            });
          }
          const { data: existingProfile } = await admin
            .from("profiles")
            .select("id")
            .eq("auth_user_id", uid)
            .maybeSingle();
          if (!existingProfile) {
            await admin.from("profiles").insert({
              auth_user_id: uid,
              email,
              full_name: "Super Admin",
              status: "active",
            });
          } else {
            await admin
              .from("profiles")
              .update({ status: "active", email })
              .eq("auth_user_id", uid);
          }
        } catch (e) {
          console.warn("[login] super_admin ensure role:", e);
        }
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
        role: "super_admin" as const,
      };
    }

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
    let signInPassword = password;
    let resolvedKind: string | null = null;

    try {
      if (looksLikeEmail(ident)) {
        // email path below
      } else {
        const { data: resolved } = await client.rpc("resolve_staff_login" as never, {
          _identifier: ident,
          _school_code: schoolCode,
        } as never);
        const row = Array.isArray(resolved) ? resolved[0] : resolved;
        if (row && typeof row === "object" && (row as { email?: string }).email) {
          resolvedKind = String((row as { kind?: string }).kind || "staff");
        }
      }
    } catch {
      /* optional RPC */
    }

    if (!looksLikeEmail(ident) && hasAdminKey()) {
      try {
        const provisioned = await provisionStudentLogin({
          schoolId,
          identifier: ident,
          password,
        });
        if (provisioned?.email) {
          // use provisioned path on retry below if needed
        }
      } catch (e) {
        console.error("[login] SUPABASE_SERVICE_ROLE_KEY missing — student provisioning skipped.");
      }
    }

    let emailForAuth = looksLikeEmail(ident) ? ident.toLowerCase() : ident;

    // Resolve login identity RPC when available
    try {
      const { data: resolved } = await client.rpc("resolve_login_identity", {
        _identifier: ident,
        _school_code: schoolCode,
      });
      const row = Array.isArray(resolved) ? resolved[0] : resolved;
      if (row && typeof row === "object" && (row as { email?: string }).email) {
        emailForAuth = String((row as { email: string }).email).toLowerCase();
        resolvedKind = String((row as { kind?: string }).kind || resolvedKind || "user");
      }
    } catch {
      /* optional */
    }

    let { data: signIn, error } = await client.auth.signInWithPassword({
      email: emailForAuth,
      password: signInPassword,
    });

    if ((error || !signIn?.session) && !looksLikeEmail(ident) && hasAdminKey() && schoolId) {
      try {
        const provisioned = await provisionStudentLogin({
          schoolId,
          identifier: ident,
          password,
        });
        if (provisioned?.email && provisioned?.password) {
          signInPassword = provisioned.password;
          const retry = await client.auth.signInWithPassword({
            email: provisioned.email,
            password: signInPassword,
          });
          signIn = retry.data;
          error = retry.error;
        } else if (provisioned && "error" in provisioned && provisioned.error) {
          return { error: String(provisioned.error) };
        }
      } catch (e) {
        console.error("[login] provision retry failed", e);
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

    const uid = signIn.user?.id ?? null;
    const priority = ["super_admin", "school_admin", "examination_officer", "teacher", "student"];
    let primaryRole: string | null = null;

    const pickRole = (roles: { role: string }[] | null | undefined) => {
      const list = (roles ?? []).map((r) => String(r.role).toLowerCase().trim());
      return priority.find((r) => list.includes(r)) ?? list[0] ?? null;
    };

    // 1) Prefer service-role lookup (bypasses RLS)
    try {
      if (uid && serviceKey) {
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
        primaryRole = pickRole(roles as { role: string }[] | null);

        // Activate profile so requireRole does not bounce pending users back to /login
        try {
          await admin
            .from("profiles")
            .update({ status: "active" } as never)
            .eq("auth_user_id", uid)
            .in("status", ["pending", "invited", "inactive"]);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn("[login] service-role role lookup failed", e);
    }

    // 2) Fallback: query roles with the user's own JWT (works when SERVICE_ROLE is missing)
    if (!primaryRole && uid && signIn.session?.access_token) {
      try {
        const authed = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: roles } = await authed.from("user_roles").select("role").eq("user_id", uid);
        primaryRole = pickRole(roles as { role: string }[] | null);
      } catch (e) {
        console.warn("[login] jwt role lookup failed", e);
      }
    }

    if (!primaryRole) {
      return {
        session: {
          access_token: signIn.session.access_token,
          refresh_token: signIn.session.refresh_token,
        },
        role: null,
        error:
          "Signed in, but no role is assigned to this account yet. Ask your school admin to assign a role (school_admin, teacher, officer, or student).",
      };
    }

    return {
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
      role: primaryRole,
    };
  });

/** Alias used by login route — keep in sync with loginWithSchoolCode */
export const signInWithSchoolCode = loginWithSchoolCode;

export {
  reviewSchoolApplication,
  createSchoolUser,
  importStudents,
} from "@/lib/auth.school-admin.functions";
