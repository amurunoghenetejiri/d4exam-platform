import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function resolveServiceKey() {
  return (
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SECRET_KEY"] ||
    process.env["SUPABASE_SERVICE_KEY"] ||
    process.env["SB_SERVICE_ROLE_KEY"] ||
    ""
  );
}

const loginInputSchema = z.object({
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
    // Service role is optional. Login works with anon/publishable key + public RPCs.
    const { hasAdminKey, provisionStudentLogin, writeLoginAudit } = await import("@/lib/login.server").catch(
      () =>
        ({
          hasAdminKey: () => false,
          provisionStudentLogin: async () => null,
          writeLoginAudit: async () => undefined,
        }) as never,
    );

    const url =
      process.env["SUPABASE_URL"] ??
      process.env["VITE_SUPABASE_URL"] ??
      process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const anonKey =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["SUPABASE_ANON_KEY"] ??
      process.env["VITE_SUPABASE_ANON_KEY"] ??
      process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    const serviceKey = resolveServiceKey();

    if (!url || !anonKey) {
      console.error("[login] Missing SUPABASE_URL or publishable/anon key on the server");
      return { error: "Server configuration error. Contact support." };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const schoolCode = (data.schoolCode ?? "").trim().toUpperCase();
    const ident = data.identifier.trim();
    const password = data.password;
    const emailLower = looksLikeEmail(ident) ? ident.toLowerCase() : "";

    // ---------- Platform super admin (blank school code + email) ----------
    const isSuperCode =
      schoolCode === "" || schoolCode === "SUPER" || schoolCode === "PLATFORM";
    if (looksLikeEmail(ident) && isSuperCode) {
      const { data: signIn, error } = await client.auth.signInWithPassword({
        email: emailLower,
        password,
      });

      if (error || !signIn?.session || !signIn?.user) {
        return {
          error: error?.message || "Invalid email or password.",
        };
      }

      const token = signIn.session.access_token;
      const uid = signIn.user.id;
      let isSuper = false;

      // Prefer JWT + public RPC (no service role needed)
      try {
        const authed = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: rpcSuper } = await authed.rpc("is_super_admin");
        if (rpcSuper === true) isSuper = true;
        if (!isSuper) {
          const { data: roles } = await authed.from("user_roles").select("role").eq("user_id", uid);
          isSuper = (roles ?? []).some(
            (r: { role: string }) => String(r.role).toLowerCase() === "super_admin",
          );
        }
      } catch {
        /* continue */
      }

      // Optional service-role recovery (only if key exists)
      if (!isSuper && serviceKey) {
        try {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
          isSuper = (roles ?? []).some(
            (r: { role: string }) => String(r.role).toLowerCase() === "super_admin",
          );
        } catch {
          /* ignore */
        }
      }

      if (!isSuper) {
        return {
          error:
            "This account is not a platform super admin. Enter your school code to sign in as a school user.",
        };
      }

      try {
        await writeLoginAudit({
          schoolId: null,
          userId: uid,
          description: "Super admin / platform sign-in",
        });
      } catch {
        /* ignore */
      }

      return {
        session: {
          access_token: signIn.session.access_token,
          refresh_token: signIn.session.refresh_token,
        },
        role: "super_admin" as const,
      };
    }

    // ---------- School users (all roles) ----------
    if (!schoolCode) {
      return { error: "School code is required for school accounts." };
    }

    // Resolve school via public SECURITY DEFINER RPC (works without service role)
    let schoolId: string | null = null;
    let schoolStatus: string | null = null;

    try {
      const { data: rpcSchool, error: rpcErr } = await client.rpc("resolve_school_for_login", {
        _school_code: schoolCode,
      });
      if (rpcErr) console.warn("[login] resolve_school_for_login", rpcErr.message);
      const row = Array.isArray(rpcSchool) ? rpcSchool[0] : rpcSchool;
      if (row && typeof row === "object" && (row as { id?: string }).id) {
        schoolId = String((row as { id: string }).id);
        schoolStatus = String((row as { status?: string }).status || "");
      }
    } catch (e) {
      console.warn("[login] school rpc failed", e);
    }

    // Optional service-role fallback if RPC not migrated yet
    if (!schoolId && serviceKey) {
      try {
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: exact } = await admin
          .from("schools")
          .select("id, status")
          .eq("school_code", schoolCode)
          .maybeSingle();
        if (exact?.id) {
          schoolId = exact.id as string;
          schoolStatus = String(exact.status || "");
        }
      } catch {
        /* ignore */
      }
    }

    // Last resort: anon table read (fails under RLS — kept for open policies)
    if (!schoolId) {
      try {
        const { data: exact } = await client
          .from("schools")
          .select("id, status")
          .eq("school_code", schoolCode)
          .maybeSingle();
        if (exact?.id) {
          schoolId = exact.id as string;
          schoolStatus = String(exact.status || "");
        }
      } catch {
        /* ignore */
      }
    }

    if (!schoolId) {
      return {
        error:
          "Invalid school code. If this persists, run the latest SQL migration (resolve_school_for_login) in Supabase.",
      };
    }

    if (schoolStatus && schoolStatus.toLowerCase() === "suspended") {
      return { error: "This school account is suspended. Contact support." };
    }

    let signInPassword = password;
    let resolvedKind: string | null = null;
    let emailForAuth = looksLikeEmail(ident) ? ident.toLowerCase() : ident;

    // Public identity resolver (granted to anon)
    try {
      const { data: resolved } = await client.rpc("resolve_login_identity", {
        _school_code: schoolCode,
        _identifier: ident,
      });
      const row = Array.isArray(resolved) ? resolved[0] : resolved;
      if (row && typeof row === "object") {
        if ((row as { kind?: string }).kind === "school_inactive") {
          return { error: "This school is not active." };
        }
        if ((row as { email?: string }).email) {
          emailForAuth = String((row as { email: string }).email).toLowerCase();
          resolvedKind = String((row as { kind?: string }).kind || "user");
        }
      }
    } catch {
      /* optional */
    }

    // Optional student provisioning only when service role is available
    if (!looksLikeEmail(ident) && hasAdminKey?.() && schoolId) {
      try {
        const provisioned = await provisionStudentLogin({
          schoolId,
          schoolCode,
          identifier: ident,
          password,
        });
        if (provisioned && "email" in provisioned && provisioned.email && provisioned.password) {
          emailForAuth = provisioned.email;
          signInPassword = provisioned.password;
          resolvedKind = "student";
        }
      } catch {
        /* skip — student can still sign in if already provisioned */
      }
    }

    let { data: signIn, error } = await client.auth.signInWithPassword({
      email: emailForAuth,
      password: signInPassword,
    });

    // One more provision retry if password failed and service role exists
    if ((error || !signIn?.session) && !looksLikeEmail(ident) && hasAdminKey?.() && schoolId) {
      try {
        const provisioned = await provisionStudentLogin({
          schoolId,
          schoolCode,
          identifier: ident,
          password,
        });
        if (provisioned && "email" in provisioned && provisioned.email && provisioned.password) {
          const retry = await client.auth.signInWithPassword({
            email: provisioned.email,
            password: provisioned.password,
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

    try {
      await writeLoginAudit({
        schoolId,
        userId: signIn.user?.id ?? null,
        description: resolvedKind ? `User signed in (${resolvedKind})` : "User signed in",
      });
    } catch {
      /* ignore */
    }

    const uid = signIn.user?.id ?? null;
    const token = signIn.session.access_token;
    const priority = ["super_admin", "school_admin", "examination_officer", "teacher", "student"];
    let primaryRole: string | null = null;

    const pickRole = (roles: { role: string }[] | null | undefined) => {
      const list = (roles ?? []).map((r) => String(r.role).toLowerCase().trim());
      return priority.find((r) => list.includes(r)) ?? list[0] ?? null;
    };

    // Role from user's own JWT (works without service role if RLS allows own roles)
    if (uid && token) {
      try {
        const authed = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: roles } = await authed.from("user_roles").select("role").eq("user_id", uid);
        primaryRole = pickRole(roles as { role: string }[] | null);

        if (!primaryRole) {
          try {
            const { data: rpcSuper } = await authed.rpc("is_super_admin");
            if (rpcSuper === true) primaryRole = "super_admin";
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        console.warn("[login] jwt role lookup failed", e);
      }
    }

    // Optional service-role role lookup
    if (!primaryRole && uid && serviceKey) {
      try {
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
        primaryRole = pickRole(roles as { role: string }[] | null);
        try {
          await admin
            .from("profiles")
            .update({ status: "active" } as never)
            .eq("auth_user_id", uid)
            .in("status", ["pending", "invited", "inactive"]);
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
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
          "Signed in, but no role is assigned to this account yet. Ask your school admin to assign a role.",
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

export const signInWithSchoolCode = loginWithSchoolCode;

export {
  reviewSchoolApplication,
  createSchoolUser,
  importStudents,
} from "@/lib/auth.school-admin.functions";
