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
        applicationId: z.string().uuid().optional(),
        adminEmail: z.string().trim().email().max(255).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const code = data.trackingCode.trim();
    const password = data.password;
    const applicationId = data.applicationId?.trim() || null;
    const adminEmailHint = (data.adminEmail || email).trim().toLowerCase();

    const { url, key } = publicEnv();
    if (!url || !key) {
      return { error: "Server configuration error. Contact support." };
    }

    const client = createClient(url, key, {
      global: { fetch: createSupabaseFetch(key) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    type AppRow = {
      id: string;
      status: string;
      applicant_email: string;
      issued_school_code: string | null;
      issued_admin_email: string | null;
      school_name: string | null;
      tracking_code?: string | null;
    };
    let app: AppRow | null = null;

    const emailsToTry = [...new Set([email, adminEmailHint].filter(Boolean))];

    for (const em of emailsToTry) {
      if (app) break;
      try {
        const { data: rpcRows } = await client.rpc("lookup_school_application_for_setup", {
          _email: em,
          _tracking_code: code,
        });
        const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        if (row && typeof row === "object" && (row as AppRow).id) {
          app = row as AppRow;
        }
      } catch {
        /* RPC may not exist yet */
      }
    }

    if (!app && applicationId) {
      const { data: byId } = await client
        .from("school_applications")
        .select(
          "id, status, applicant_email, issued_school_code, issued_admin_email, school_name, tracking_code",
        )
        .eq("id", applicationId)
        .maybeSingle();
      if (byId?.id) app = byId as AppRow;
    }

    if (!app) {
      const { data: rows } = await client
        .from("school_applications")
        .select(
          "id, status, applicant_email, issued_school_code, issued_admin_email, school_name, tracking_code",
        )
        .ilike("tracking_code", code)
        .limit(10);
      const list = (rows ?? []) as AppRow[];
      app =
        list.find((r) => {
          const a = (r.applicant_email || "").trim().toLowerCase();
          const i = (r.issued_admin_email || "").trim().toLowerCase();
          return emailsToTry.includes(a) || emailsToTry.includes(i);
        }) ??
        list[0] ??
        null;
    }

    if (!app) {
      const collected: AppRow[] = [];
      for (const em of emailsToTry) {
        const { data: a } = await client
          .from("school_applications")
          .select(
            "id, status, applicant_email, issued_school_code, issued_admin_email, school_name, tracking_code",
          )
          .ilike("applicant_email", em)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(5);
        const { data: b } = await client
          .from("school_applications")
          .select(
            "id, status, applicant_email, issued_school_code, issued_admin_email, school_name, tracking_code",
          )
          .ilike("issued_admin_email", em)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(5);
        for (const row of [...(a ?? []), ...(b ?? [])] as AppRow[]) {
          if (row?.id && !collected.some((x) => x.id === row.id)) collected.push(row);
        }
      }
      app =
        collected.find((r) => (r.tracking_code || "").toLowerCase() === code.toLowerCase()) ??
        (collected.length === 1 ? collected[0] : null);
    }

    if (!app) {
      return {
        error:
          "We could not find an application with those details. Use the same email and reference code from your application, then try again.",
      };
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

    const claimCode = String(app.tracking_code || code).trim();
    const claimEmails = [
      ...new Set(
        [adminEmail, email, String(app.applicant_email || "").toLowerCase()].filter(Boolean),
      ),
    ];
    let claimErr: { message?: string } | null = null;
    let claimed: unknown = null;
    for (const claimEmail of claimEmails) {
      const res = await client.rpc("claim_approved_school_admin", {
        _tracking_code: claimCode,
        _email: claimEmail,
        _user_id: userId,
      });
      claimed = res.data;
      claimErr = res.error;
      if (!claimErr) break;
      const claimRowEarly = Array.isArray(claimed) ? claimed[0] : claimed;
      if (claimRowEarly && typeof claimRowEarly === "object" && (claimRowEarly as { ok?: boolean }).ok) {
        claimErr = null;
        break;
      }
    }

    if (claimErr) {
      console.warn("[set-password] claim_approved_school_admin", claimErr.message);
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
