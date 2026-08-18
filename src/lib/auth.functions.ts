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
    const emailLower = looksLikeEmail(ident) ? ident.toLowerCase() : "";

    // Super admin: blank school code (or SUPER / PLATFORM) + email + password
    const isSuperCode =
      schoolCode === "" || schoolCode === "SUPER" || schoolCode === "PLATFORM";
    if (looksLikeEmail(ident) && isSuperCode) {
      let { data: signIn, error } = await client.auth.signInWithPassword({
        email: emailLower,
        password,
      });

      // Recover / bootstrap platform super admin when service role is available
      if ((error || !signIn?.session || !signIn?.user) && serviceKey) {
        try {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          // Find auth user by email (paginate a reasonable range)
          let authUserId: string | null = null;
          for (let page = 1; page <= 5 && !authUserId; page++) {
            const { data: listed } = await admin.auth.admin.listUsers({ page, perPage: 200 });
            const hit = (listed?.users ?? []).find(
              (u) => (u.email || "").toLowerCase() === emailLower,
            );
            if (hit?.id) authUserId = hit.id;
            if ((listed?.users?.length ?? 0) < 200) break;
          }

          if (authUserId) {
            const { data: roles } = await admin
              .from("user_roles")
              .select("role")
              .eq("user_id", authUserId);
            const isSuper = (roles ?? []).some(
              (r: { role: string }) => String(r.role).toLowerCase() === "super_admin",
            );
            if (isSuper) {
              // Sync password to what the owner just typed, then retry sign-in
              await admin.auth.admin.updateUserById(authUserId, {
                password,
                email_confirm: true,
              });
              const retry = await client.auth.signInWithPassword({
                email: emailLower,
                password,
              });
              signIn = retry.data;
              error = retry.error;
            }
          } else {
            // Bootstrap only if the platform has zero super admins yet
            const { count } = await admin
              .from("user_roles")
              .select("id", { count: "exact", head: true })
              .eq("role", "super_admin");
            if ((count ?? 0) === 0) {
              const { data: created, error: createErr } = await admin.auth.admin.createUser({
                email: emailLower,
                password,
                email_confirm: true,
                user_metadata: { full_name: "Super Admin", role: "super_admin" },
              });
              if (!createErr && created?.user?.id) {
                authUserId = created.user.id;
                await admin.from("user_roles").insert({
                  user_id: authUserId,
                  role: "super_admin",
                  school_id: null,
                });
                await admin.from("profiles").insert({
                  auth_user_id: authUserId,
                  email: emailLower,
                  full_name: "Super Admin",
                  status: "active",
                });
                const retry = await client.auth.signInWithPassword({
                  email: emailLower,
                  password,
                });
                signIn = retry.data;
                error = retry.error;
              }
            }
          }
        } catch (e) {
          console.warn("[login] super_admin recovery failed", e);
        }
      }

      if (error || !signIn?.session || !signIn?.user) {
        return {
          error:
            error?.message ||
            "Invalid email or password. School accounts must enter a school code.",
        };
      }

      const uid = signIn.user.id;
      const token = signIn.session.access_token;
      let isSuper = false;

      try {
        if (serviceKey) {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
          isSuper = (roles ?? []).some(
            (r: { role: string }) => String(r.role).toLowerCase() === "super_admin",
          );
        }
      } catch {
        /* continue */
      }

      if (!isSuper) {
        try {
          const authed = createClient(url, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: roles } = await authed.from("user_roles").select("role").eq("user_id", uid);
          isSuper = (roles ?? []).some(
            (r: { role: string }) => String(r.role).toLowerCase() === "super_admin",
          );
        } catch {
          /* continue */
        }
      }

      if (!isSuper) {
        try {
          const authed = createClient(url, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: rpcSuper } = await authed.rpc("is_super_admin");
          if (rpcSuper === true) isSuper = true;
        } catch {
          /* continue */
        }
      }

      if (!isSuper) {
        const meta = (signIn.user.app_metadata || {}) as Record<string, unknown>;
        const umeta = (signIn.user.user_metadata || {}) as Record<string, unknown>;
        const roleHint = String(meta.role || umeta.role || "").toLowerCase();
        if (roleHint === "super_admin") isSuper = true;
      }

      if (!isSuper) {
        return {
          error:
            "This account is not a platform super admin. Enter your school code to sign in as a school user.",
        };
      }

      if (serviceKey) {
        try {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const email = (signIn.user.email || emailLower).toLowerCase();
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

    if (!schoolCode) {
      return {
        error:
          "School code is required for school accounts.",
      };
    }

    const { data: school } = await client
      .from("schools")
      .select("id, school_code, status")
      .eq("school_code", schoolCode)
      .maybeSingle();

    if (!school?.id) {
      return { error: "Invalid school code." };
    }

    const schoolId = school.id as string;

    let signInPassword = password;
    let resolvedKind: string | null = null;

    try {
      if (!looksLikeEmail(ident)) {
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
        await provisionStudentLogin({
          schoolId,
          identifier: ident,
          password,
        });
      } catch {
        /* skip */
      }
    }

    let emailForAuth = looksLikeEmail(ident) ? ident.toLowerCase() : ident;

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
    const priority = ["super_admin", "school_admin", "examination_officer", "teacher", "student"];
    let primaryRole: string | null = null;

    const pickRole = (roles: { role: string }[] | null | undefined) => {
      const list = (roles ?? []).map((r) => String(r.role).toLowerCase().trim());
      return priority.find((r) => list.includes(r)) ?? list[0] ?? null;
    };

    try {
      if (uid && serviceKey) {
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
      }
    } catch (e) {
      console.warn("[login] service-role role lookup failed", e);
    }

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

    if (!primaryRole && uid && signIn.session?.access_token) {
      try {
        const authed = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: rpcSuper } = await authed.rpc("is_super_admin");
        if (rpcSuper === true) primaryRole = "super_admin";
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
