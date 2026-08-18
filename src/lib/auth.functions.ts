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
    const { hasAdminKey, provisionStudentLogin, writeLoginAudit } = await import("@/lib/login.server");
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

    // Platform super admin: blank / SUPER / PLATFORM school code + email + password
    const isSuperCode =
      schoolCode === "" || schoolCode === "SUPER" || schoolCode === "PLATFORM";
    if (looksLikeEmail(ident) && isSuperCode) {
      let { data: signIn, error } = await client.auth.signInWithPassword({
        email: emailLower,
        password,
      });

      if ((error || !signIn?.session || !signIn?.user) && serviceKey) {
        try {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          let authUserId: string | null = null;
          for (let page = 1; page <= 10 && !authUserId; page++) {
            const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
              page,
              perPage: 200,
            });
            if (listErr) {
              console.warn("[login] listUsers", listErr.message);
              break;
            }
            const hit = (listed?.users ?? []).find(
              (u) => (u.email || "").toLowerCase() === emailLower,
            );
            if (hit?.id) authUserId = hit.id;
            if ((listed?.users?.length ?? 0) < 200) break;
          }

          if (authUserId) {
            const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
              password,
              email_confirm: true,
              user_metadata: { full_name: "Super Admin", role: "super_admin" },
            });
            if (updErr) console.warn("[login] updateUserById", updErr.message);
          } else {
            const { data: created, error: createErr } = await admin.auth.admin.createUser({
              email: emailLower,
              password,
              email_confirm: true,
              user_metadata: { full_name: "Super Admin", role: "super_admin" },
            });
            if (createErr) {
              console.warn("[login] createUser", createErr.message);
            } else if (created?.user?.id) {
              authUserId = created.user.id;
            }
          }

          if (authUserId) {
            const { data: existingRole } = await admin
              .from("user_roles")
              .select("id")
              .eq("user_id", authUserId)
              .eq("role", "super_admin")
              .maybeSingle();
            if (!existingRole) {
              await admin.from("user_roles").insert({
                user_id: authUserId,
                role: "super_admin",
                school_id: null,
              });
            }

            const { data: existingProfile } = await admin
              .from("profiles")
              .select("id")
              .eq("auth_user_id", authUserId)
              .maybeSingle();
            if (!existingProfile) {
              await admin.from("profiles").insert({
                auth_user_id: authUserId,
                email: emailLower,
                full_name: "Super Admin",
                status: "active",
              });
            } else {
              await admin
                .from("profiles")
                .update({ status: "active", email: emailLower, full_name: "Super Admin" })
                .eq("auth_user_id", authUserId);
            }

            const retry = await client.auth.signInWithPassword({
              email: emailLower,
              password,
            });
            signIn = retry.data;
            error = retry.error;
          }
        } catch (e) {
          console.warn("[login] super_admin ensure failed", e);
        }
      }

      if (error || !signIn?.session || !signIn?.user) {
        if (!serviceKey) {
          return {
            error:
              "Invalid email or password. Server is missing SUPABASE_SERVICE_ROLE_KEY (needed to recover admin accounts). Add it in Vercel → Settings → Environment Variables.",
          };
        }
        return {
          error:
            error?.message ||
            "Invalid email or password. Leave school code blank for platform admin.",
        };
      }

      const uid = signIn.user.id;

      if (serviceKey) {
        try {
          const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
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
          await admin
            .from("profiles")
            .upsert(
              {
                auth_user_id: uid,
                email: emailLower,
                full_name: "Super Admin",
                status: "active",
              } as never,
              { onConflict: "auth_user_id" },
            );
        } catch (e) {
          console.warn("[login] post-login ensure role", e);
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
      return { error: "School code is required for school accounts." };
    }

    // Resolve school — anon cannot read schools (RLS is authenticated-only).
    // Prefer service role, then flexible match.
    let school: { id: string; school_code: string; status?: string } | null = null;

    if (serviceKey) {
      try {
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: exact } = await admin
          .from("schools")
          .select("id, school_code, status")
          .eq("school_code", schoolCode)
          .maybeSingle();
        if (exact?.id) {
          school = exact as { id: string; school_code: string; status?: string };
        } else {
          // Case-insensitive / whitespace-tolerant fallback
          const { data: all } = await admin
            .from("schools")
            .select("id, school_code, status")
            .limit(500);
          const hit = (all ?? []).find(
            (s) => String(s.school_code || "").trim().toUpperCase() === schoolCode,
          );
          if (hit?.id) school = hit as { id: string; school_code: string; status?: string };
        }
      } catch (e) {
        console.warn("[login] service-role school lookup failed", e);
      }
    }

    // Anon fallback (works only if a public/login policy exists)
    if (!school?.id) {
      try {
        const { data: exact } = await client
          .from("schools")
          .select("id, school_code, status")
          .eq("school_code", schoolCode)
          .maybeSingle();
        if (exact?.id) school = exact as { id: string; school_code: string; status?: string };
      } catch {
        /* ignore */
      }
    }

    if (!school?.id) {
      if (!serviceKey) {
        return {
          error:
            "Could not verify school code. Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel environment variables.",
        };
      }
      return { error: "Invalid school code." };
    }

    if (school.status && String(school.status).toLowerCase() === "suspended") {
      return { error: "This school account is suspended. Contact support." };
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
          schoolCode,
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

    // Service-role identity resolve if RPC did not return an email
    if ((!looksLikeEmail(emailForAuth) || emailForAuth === ident.toLowerCase()) && serviceKey && looksLikeEmail(ident) === false) {
      try {
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        // Teachers / staff by email stored on profiles linked to this school
        const { data: staffRoles } = await admin
          .from("user_roles")
          .select("user_id, role")
          .eq("school_id", schoolId)
          .limit(2000);
        const userIds = [...new Set((staffRoles ?? []).map((r) => r.user_id as string))];
        if (userIds.length) {
          const { data: profiles } = await admin
            .from("profiles")
            .select("auth_user_id, email, full_name")
            .in("auth_user_id", userIds)
            .limit(2000);
          const idLower = ident.toLowerCase();
          const match = (profiles ?? []).find((p) => {
            const em = String(p.email || "").toLowerCase();
            const nm = String(p.full_name || "").toLowerCase();
            return em === idLower || nm === idLower || nm.includes(idLower);
          });
          if (match?.email) {
            emailForAuth = String(match.email).toLowerCase();
            resolvedKind = resolvedKind || "staff";
          }
        }
      } catch (e) {
        console.warn("[login] staff identity fallback", e);
      }
    }

    let { data: signIn, error } = await client.auth.signInWithPassword({
      email: emailForAuth,
      password: signInPassword,
    });

    if ((error || !signIn?.session) && !looksLikeEmail(ident) && hasAdminKey() && schoolId) {
      try {
        const provisioned = await provisionStudentLogin({
          schoolId,
          schoolCode,
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
