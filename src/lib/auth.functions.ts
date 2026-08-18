import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function studentSyntheticEmail(schoolCode: string, matric: string) {
  const safeMatric = matric.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const safeCode = schoolCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${safeMatric}@${safeCode || "school"}.student.d4exam.local`;
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
    const loginServer = await import("@/lib/login.server").catch(() => null);
    const hasAdminKey = loginServer?.hasAdminKey ?? (() => false);
    const provisionStudentLogin =
      loginServer?.provisionStudentLogin ?? (async () => null);
    const writeLoginAudit = loginServer?.writeLoginAudit ?? (async () => undefined);

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
        return { error: error?.message || "Invalid email or password." };
      }

      const token = signIn.session.access_token;
      const uid = signIn.user.id;
      let isSuper = false;

      try {
        const authed = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: rpcSuper } = await authed.rpc("is_super_admin");
        if (rpcSuper === true) isSuper = true;
        if (!isSuper) {
          const { data: myRoles } = await authed.rpc("get_my_roles");
          const list = Array.isArray(myRoles)
            ? myRoles.map((r: { role?: string } | string) =>
                typeof r === "string" ? r : String((r as { role?: string }).role || ""),
              )
            : [];
          isSuper = list.some((r) => r.toLowerCase() === "super_admin");
        }
        if (!isSuper) {
          const { data: roles } = await authed.from("user_roles").select("role").eq("user_id", uid);
          isSuper = (roles ?? []).some(
            (r: { role: string }) => String(r.role).toLowerCase() === "super_admin",
          );
        }
      } catch {
        /* continue */
      }

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

    // ---------- School users: admin, teacher, officer, student ----------
    if (!schoolCode) {
      return { error: "School code is required for school accounts." };
    }

    let schoolId: string | null = null;
    let schoolStatus: string | null = null;

    try {
      const { data: rpcSchool } = await client.rpc("resolve_school_for_login", {
        _school_code: schoolCode,
      });
      const row = Array.isArray(rpcSchool) ? rpcSchool[0] : rpcSchool;
      if (row && typeof row === "object" && (row as { id?: string }).id) {
        schoolId = String((row as { id: string }).id);
        schoolStatus = String((row as { status?: string }).status || "");
      }
    } catch (e) {
      console.warn("[login] school rpc failed", e);
    }

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

    if (!schoolId) {
      return {
        error:
          "Invalid school code. Run the latest SQL in Supabase (resolve_school_for_login) if this continues.",
      };
    }

    if (schoolStatus && schoolStatus.toLowerCase() === "suspended") {
      return { error: "This school account is suspended. Contact support." };
    }

    let resolvedKind: string | null = null;
    const candidateEmails: string[] = [];

    if (looksLikeEmail(ident)) {
      candidateEmails.push(ident.toLowerCase());
    }

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
          const em = String((row as { email: string }).email).toLowerCase();
          if (!candidateEmails.includes(em)) candidateEmails.push(em);
          resolvedKind = String((row as { kind?: string }).kind || "user");
        }
      }
    } catch {
      /* optional */
    }

    // Student synthetic email (matric@schoolcode.student.d4exam.local)
    if (!looksLikeEmail(ident)) {
      const synth = studentSyntheticEmail(schoolCode, ident);
      if (!candidateEmails.includes(synth)) candidateEmails.push(synth);
    }

    // Optional provision when service role is present (creates auth for imported students)
    if (!looksLikeEmail(ident) && hasAdminKey() && schoolId) {
      try {
        const provisioned = await provisionStudentLogin({
          schoolId,
          schoolCode,
          identifier: ident,
          password,
        });
        if (provisioned && "email" in provisioned && provisioned.email) {
          const em = String(provisioned.email).toLowerCase();
          if (!candidateEmails.includes(em)) candidateEmails.unshift(em);
          resolvedKind = "student";
        }
      } catch {
        /* skip */
      }
    }

    if (candidateEmails.length === 0) {
      return {
        error:
          "Could not find this user in the school. Check school code and email / matric / staff ID.",
      };
    }

    let signIn: {
      session: { access_token: string; refresh_token: string } | null;
      user: { id: string } | null;
    } | null = null;
    let lastError: string | null = null;

    for (const email of candidateEmails) {
      const attempt = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (attempt.data?.session && attempt.data.user) {
        signIn = attempt.data as never;
        lastError = null;
        break;
      }
      lastError = attempt.error?.message || "Invalid credentials";
    }

    // Student provision retry
    if (!signIn?.session && !looksLikeEmail(ident) && hasAdminKey() && schoolId) {
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
          if (retry.data?.session) {
            signIn = retry.data as never;
            lastError = null;
            resolvedKind = "student";
          } else {
            lastError = retry.error?.message || lastError;
          }
        } else if (provisioned && "error" in provisioned && provisioned.error) {
          return { error: String(provisioned.error) };
        }
      } catch (e) {
        console.error("[login] provision retry", e);
      }
    }

    if (!signIn?.session || !signIn.user) {
      return {
        error:
          lastError ||
          "Invalid credentials. Use the password given at creation (staff/officer ID or matric for students).",
      };
    }

    try {
      await writeLoginAudit({
        schoolId,
        userId: signIn.user.id,
        description: resolvedKind ? `User signed in (${resolvedKind})` : "User signed in",
      });
    } catch {
      /* ignore */
    }

    const uid = signIn.user.id;
    const token = signIn.session.access_token;
    const priority = ["super_admin", "school_admin", "examination_officer", "teacher", "student"];
    let primaryRole: string | null = null;

    const pickRole = (roles: string[]) => {
      const list = roles.map((r) => r.toLowerCase().trim()).filter(Boolean);
      return priority.find((r) => list.includes(r)) ?? list[0] ?? null;
    };

    try {
      const authed = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Preferred: SECURITY DEFINER get_my_roles
      try {
        const { data: myRoles } = await authed.rpc("get_my_roles");
        const list = Array.isArray(myRoles)
          ? myRoles.map((r: { role?: string } | string) =>
              typeof r === "string" ? r : String((r as { role?: string }).role || ""),
            )
          : [];
        primaryRole = pickRole(list);
      } catch {
        /* ignore */
      }

      if (!primaryRole) {
        const { data: roles } = await authed.from("user_roles").select("role").eq("user_id", uid);
        primaryRole = pickRole((roles ?? []).map((r: { role: string }) => String(r.role)));
      }

      if (!primaryRole) {
        const { data: rpcSuper } = await authed.rpc("is_super_admin");
        if (rpcSuper === true) primaryRole = "super_admin";
      }

      // Hint from resolve kind when role row is missing
      if (!primaryRole && resolvedKind) {
        const kindMap: Record<string, string> = {
          student: "student",
          teacher: "teacher",
          officer: "examination_officer",
          school_admin: "school_admin",
          profile: "",
        };
        const mapped = kindMap[resolvedKind];
        if (mapped) primaryRole = mapped;
      }
    } catch (e) {
      console.warn("[login] role lookup failed", e);
    }

    if (!primaryRole && serviceKey) {
      try {
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
        primaryRole = pickRole((roles ?? []).map((r: { role: string }) => String(r.role)));
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
          "Signed in, but no role is assigned. Ask your school admin to create/import this user again.",
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
