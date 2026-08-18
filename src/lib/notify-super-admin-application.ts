import { supabase } from "@/integrations/supabase/client";

/** Notify every super_admin when a school application is submitted. */
export async function notifySuperAdminsOfApplication(
  schoolName: string,
  applicationId: string,
  trackingCode?: string,
) {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin");
    const ids = [...new Set((roles ?? []).map((r) => r.user_id).filter(Boolean))];
    if (ids.length === 0) return;

    const ref = trackingCode || applicationId.slice(0, 8);
    const title = "New school application";
    const message = `${schoolName} submitted an application (ref ${ref}). Open Applications to review.`;
    const link = "/super-admin/applications";

    for (const uid of ids) {
      try {
        await supabase.rpc("insert_notification" as never, {
          _recipient: uid,
          _title: title,
          _message: message,
          _type: "info",
          _school_id: null,
          _link: link,
          _entity_type: "school_application",
          _entity_id: applicationId,
        } as never);
      } catch {
        await supabase.from("notifications").insert({
          recipient_user_id: uid,
          title,
          message,
          type: "info",
          link,
          entity_type: "school_application",
          entity_id: applicationId,
        } as never);
      }
    }
  } catch {
    // DB trigger also notifies; never block submit
  }
}
