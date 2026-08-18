import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Applicant sets their own password after approval (tracking code + email). */
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error } = await supabaseAdmin
      .from("school_applications")
      .select(
        "id, status, applicant_email, tracking_code, issued_school_code, issued_admin_email, school_name",
      )
      .eq("tracking_code", code)
      .ilike("applicant_email", email)
      .maybeSingle();

    if (error || !app) {
      return { error: "We could not find an approved application with those details." };
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

    let userId: string | null = null;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("auth_user_id")
      .eq("email", adminEmail)
      .maybeSingle();
    if (prof?.auth_user_id) userId = prof.auth_user_id as string;

    if (!userId) {
      for (let page = 1; page <= 5 && !userId; page++) {
        const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        const hit = (listed?.users ?? []).find((u) => (u.email || "").toLowerCase() === adminEmail);
        if (hit?.id) userId = hit.id;
        if ((listed?.users?.length ?? 0) < 200) break;
      }
    }

    if (!userId) {
      return {
        error:
          "Your school account is still being prepared. Try again in a few minutes or contact support.",
      };
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) return { error: updErr.message || "Could not update password." };

    await supabaseAdmin
      .from("school_applications")
      .update({ issued_admin_password: null } as never)
      .eq("id", app.id);

    return {
      ok: true as const,
      schoolCode: (app.issued_school_code as string) || "",
      adminEmail,
      schoolName: (app.school_name as string) || "",
    };
  });
