import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

function isNewSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function publicEnv() {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    "";
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    "";
  return { url, key };
}

/**
 * Applicant sets password after approval — NO service role.
 * Uses auth.signUp (anon) + claim_approved_school_admin SECURITY DEFINER RPC.
 */
export const setApprovedSchoolAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        trackingCode: z.string().trim().min(4).max(64),
        password: z.string().min(8).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const code = data.trackingCode.trim();
    const password = data.password;

    const { url, key } = publicEnv();
    if (!url || !key) {
      return { error: "Server configuration error. Contact support." };
    }

    const client = createClient(url, key, {
      global: { fetch: createSupabaseFetch(key) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Lookup approved application (anon-readable via existing status RLS or RPC)
    let app: {
      id: string;
      status: string;
      applicant_email: string;
      issued_school_code: string | null;
      issued_admin_email: string | null;
      school_name: string | null;
    } | null = null;

    try {
      const { data: rpcRows } = await client.rpc("lookup_school_application_for_setup", {
        _email: email,
        _tracking_code: code,
      });
      const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
      if (row && typeof row === "object") app = row as typeof app;
    } catch {
      /* fall through to table read */
    }

    if (!app) {
      const { data: rows } = await client
        .from("school_applications")
        .select(
          "id, status, applicant_email, issued_school_code, issued_admin_email, school_name, tracking_code",
        )
        .eq("tracking_code", code)
        .ilike("applicant_email", email)
        .limit(1);
      app = (rows?.[0] as typeof app) ?? null;
    }

    if (!app) {
      return { error: "We could not find an application with those details." };
    }
    if (String(app.status).toLowerCase() !== "approved") {
      return {
        error:
          "Your application is not approved yet. Please wait for the platform admin to finish review.",
      };
    }

    const adminEmail = String(app.issued_admin_email || app.applicant_email || email)
      .trim()
      .toLowerCase();
    const schoolCode = String(app.issued_school_code || "").trim();
    if (!schoolCode) {
      return {
        error: "Your school code is not ready yet. Please try again in a few minutes.",
      };
    }

    // Create Auth user with the password they chose (anon signUp — no service role)
    const { data: signedUp, error: signUpErr } = await client.auth.signUp({
      email: adminEmail,
      password,
      options: {
        data: {
          full_name: app.school_name || "School Admin",
          role: "school_admin",
          school_code: schoolCode,
        },
      },
    });

    let userId = signedUp?.user?.id ?? null;

    if (signUpErr || !userId) {
      const msg = (signUpErr?.message || "").toLowerCase();
      // Account may already exist — try sign-in with the password they just entered
      if (/already|registered|exists/i.test(msg) || !userId) {
        const { data: signedIn, error: inErr } = await client.auth.signInWithPassword({
          email: adminEmail,
          password,
        });
        if (inErr || !signedIn?.user) {
          return {
            error:
              "An account with this email already exists with a different password. Use Forgot password on the login page, then sign in with your school code.",
          };
        }
        userId = signedIn.user.id;
      } else {
        return { error: signUpErr?.message || "Could not create your login." };
      }
    }

    // Attach profile + school_admin role (SECURITY DEFINER — no service role)
    const { data: claimed, error: claimErr } = await client.rpc("claim_approved_school_admin", {
      _tracking_code: code,
      _email: adminEmail,
      _user_id: userId,
    });

    if (claimErr) {
      console.warn("[set-password] claim_approved_school_admin", claimErr.message);
      // Still return ok if auth user exists — they may already have role from approval
      return {
        ok: true as const,
        schoolCode,
        adminEmail,
        schoolName: String(app.school_name || ""),
        warning:
          "Password saved. If login does not open the school panel, contact support to finish account linking.",
      };
    }

    const claimRow = Array.isArray(claimed) ? claimed[0] : claimed;
    if (claimRow && typeof claimRow === "object" && (claimRow as { error?: string }).error) {
      return { error: String((claimRow as { error: string }).error) };
    }

    return {
      ok: true as const,
      schoolCode,
      adminEmail,
      schoolName: String(app.school_name || ""),
    };
  });
