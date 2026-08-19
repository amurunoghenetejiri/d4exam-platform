import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

function envUrl() {
  return (
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    ""
  );
}

function envPublishable() {
  return (
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    ""
  );
}

function envService() {
  return (
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SECRET_KEY"] ||
    process.env["SUPABASE_SERVICE_KEY"] ||
    process.env["SB_SERVICE_ROLE_KEY"] ||
    ""
  );
}

function isNewKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function makeFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, k) => headers.set(k, value));
    }
    if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

/** Confirm email, set password, link school_admin when service role is available. */
export const ensureLoginAccount = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const body =
      raw && typeof raw === "object" && "data" in (raw as object)
        ? (raw as { data: unknown }).data
        : raw;
    return z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(120),
        schoolCode: z.string().trim().max(64).optional().nullable(),
      })
      .parse(body);
  })
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const password = data.password;
    const schoolCode = (data.schoolCode || "").trim().toUpperCase() || null;

    const url = envUrl();
    const service = envService();
    const publishable = envPublishable();
    if (!url) {
      return { ok: false as const, error: "Server missing SUPABASE_URL." };
    }
    if (!service) {
      return {
        ok: false as const,
        error: "Server missing service role key. Add SUPABASE_SERVICE_ROLE_KEY on Vercel.",
      };
    }

    const admin = createClient(url, service, {
      global: { fetch: makeFetch(service) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    let userId: string | null = null;
    try {
      for (let page = 1; page <= 5 && !userId; page++) {
        const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (listErr) {
          console.warn("[ensureLogin] listUsers", listErr.message);
          break;
        }
        const found = listed?.users?.find((u) => (u.email || "").toLowerCase() === email);
        if (found?.id) {
          userId = found.id;
          break;
        }
        if (!listed?.users?.length || listed.users.length < 200) break;
      }
    } catch (e) {
      console.warn("[ensureLogin] listUsers", e);
    }

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: schoolCode ? `Admin ${schoolCode}` : "User",
          role: schoolCode ? "school_admin" : undefined,
          school_code: schoolCode || undefined,
        },
      });
      if (createErr || !created.user?.id) {
        return {
          ok: false as const,
          error: createErr?.message || "Could not create login account.",
        };
      }
      userId = created.user.id;
    } else {
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) {
        return { ok: false as const, error: updErr.message || "Could not update password." };
      }
    }

    if (schoolCode && userId) {
      const { data: school } = await admin
        .from("schools")
        .select("id")
        .ilike("school_code", schoolCode)
        .maybeSingle();

      if (school?.id) {
        const { data: byAuth } = await admin
          .from("profiles")
          .select("id")
          .eq("auth_user_id", userId)
          .maybeSingle();
        if (byAuth?.id) {
          await admin
            .from("profiles")
            .update({ school_id: school.id, email, status: "active" } as never)
            .eq("id", byAuth.id);
        } else {
          const { data: byEmail } = await admin
            .from("profiles")
            .select("id")
            .ilike("email", email)
            .maybeSingle();
          if (byEmail?.id) {
            await admin
              .from("profiles")
              .update({
                auth_user_id: userId,
                school_id: school.id,
                status: "active",
              } as never)
              .eq("id", byEmail.id);
          } else {
            await admin.from("profiles").insert({
              auth_user_id: userId,
              school_id: school.id,
              email,
              full_name: `Admin ${schoolCode}`,
              status: "active",
            } as never);
          }
        }

        const { data: existingRole } = await admin
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("role", "school_admin")
          .eq("school_id", school.id)
          .maybeSingle();
        if (!existingRole) {
          await admin.from("user_roles").insert({
            user_id: userId,
            school_id: school.id,
            role: "school_admin",
          } as never);
        }
      }
    }

    const pub = createClient(url, publishable || service, {
      global: { fetch: makeFetch(publishable || service) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signedIn, error: inErr } = await pub.auth.signInWithPassword({
      email,
      password,
    });
    if (inErr || !signedIn.session) {
      return {
        ok: false as const,
        error: inErr?.message || "Password was set but sign-in still failed.",
      };
    }
    try {
      await pub.auth.signOut();
    } catch {
      /* ignore */
    }

    return { ok: true as const, email, userId };
  });
