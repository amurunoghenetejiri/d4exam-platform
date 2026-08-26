/** School applicant notifications (in-app + push). */
import { supabase } from "@/integrations/supabase/client";
import { notifyUser, listSuperAdminUserIds, notifyMany } from "@/lib/notify";
import {
  schoolApplicationReceived,
  schoolApplicationApproved,
  schoolApplicationRejected,
  schoolApplicationNeedsChanges,
  newSchoolApplication,
} from "@/lib/notify-messages";

export async function notifyApplicantApplicationReceived(opts: {
  recipientUserId?: string | null;
  applicantEmail?: string | null;
  schoolName: string;
  applicationId: string;
}): Promise<void> {
  try {
    const copy = schoolApplicationReceived({ schoolName: opts.schoolName });
    let uid = opts.recipientUserId || "";
    if (!uid && opts.applicantEmail) {
      const { data } = await supabase
        .from("profiles")
        .select("auth_user_id")
        .eq("email", opts.applicantEmail)
        .maybeSingle();
      uid = (data as { auth_user_id?: string } | null)?.auth_user_id || "";
    }
    if (uid) {
      await notifyUser({
        recipientUserId: uid,
        title: copy.title,
        message: copy.message,
        type: "system_alert",
        link: "/application-status",
        entityType: "school_application",
        entityId: opts.applicationId,
        dedupeMinutes: 60,
      });
    }
  } catch (e) {
    console.warn("[notify] applicant received failed", e);
  }
}

export async function notifyApplicantApplicationApproved(opts: {
  recipientUserId?: string | null;
  applicantEmail?: string | null;
  schoolName: string;
  schoolId: string;
  applicationId: string;
  loginHint?: string | null;
}): Promise<void> {
  try {
    const copy = schoolApplicationApproved({
      schoolName: opts.schoolName,
      schoolId: opts.schoolId,
      loginHint: opts.loginHint,
    });
    let uid = opts.recipientUserId || "";
    if (!uid && opts.applicantEmail) {
      const { data } = await supabase
        .from("profiles")
        .select("auth_user_id")
        .eq("email", opts.applicantEmail)
        .maybeSingle();
      uid = (data as { auth_user_id?: string } | null)?.auth_user_id || "";
    }
    if (uid) {
      await notifyUser({
        recipientUserId: uid,
        title: copy.title,
        message: copy.message,
        type: "success",
        link: "/login",
        entityType: "school_application",
        entityId: opts.applicationId,
        dedupeMinutes: 10,
      });
    }
  } catch (e) {
    console.warn("[notify] applicant approved failed", e);
  }
}

export async function notifySuperAdminsNewApplicationDetailed(opts: {
  schoolName: string;
  applicationId: string;
  applicantName?: string | null;
  trackingCode?: string | null;
}): Promise<void> {
  try {
    const ids = await listSuperAdminUserIds();
    const copy = newSchoolApplication({
      schoolName: opts.schoolName,
      applicantName: opts.applicantName,
    });
    await notifyMany(
      ids.map((uid) => ({
        recipientUserId: uid,
        title: copy.title,
        message: copy.message,
        type: "system_alert",
        link: "/super-admin/applications",
        entityType: "school_application",
        entityId: opts.applicationId,
        dedupeMinutes: 5,
      })),
    );
  } catch (e) {
    console.warn("[notify] super admin application detailed failed", e);
  }
}

export async function notifyApplicantApplicationRejected(opts: {
  recipientUserId?: string | null;
  applicantEmail?: string | null;
  schoolName: string;
  applicationId: string;
  reason?: string | null;
}): Promise<void> {
  try {
    const copy = schoolApplicationRejected({ schoolName: opts.schoolName, reason: opts.reason });
    let uid = opts.recipientUserId || "";
    if (!uid && opts.applicantEmail) {
      const { data } = await supabase
        .from("profiles")
        .select("auth_user_id")
        .eq("email", opts.applicantEmail)
        .maybeSingle();
      uid = (data as { auth_user_id?: string } | null)?.auth_user_id || "";
    }
    if (uid) {
      await notifyUser({
        recipientUserId: uid,
        title: copy.title,
        message: copy.message,
        type: "error",
        link: "/application-status",
        entityType: "school_application",
        entityId: opts.applicationId,
        dedupeMinutes: 10,
      });
    }
  } catch (e) {
    console.warn("[notify] applicant rejected failed", e);
  }
}

export async function notifyApplicantNeedsChanges(opts: {
  recipientUserId?: string | null;
  applicantEmail?: string | null;
  schoolName: string;
  applicationId: string;
  reason?: string | null;
}): Promise<void> {
  try {
    const copy = schoolApplicationNeedsChanges({ schoolName: opts.schoolName, reason: opts.reason });
    let uid = opts.recipientUserId || "";
    if (!uid && opts.applicantEmail) {
      const { data } = await supabase
        .from("profiles")
        .select("auth_user_id")
        .eq("email", opts.applicantEmail)
        .maybeSingle();
      uid = (data as { auth_user_id?: string } | null)?.auth_user_id || "";
    }
    if (uid) {
      await notifyUser({
        recipientUserId: uid,
        title: copy.title,
        message: copy.message,
        type: "warning",
        link: "/application-status",
        entityType: "school_application",
        entityId: opts.applicationId,
        dedupeMinutes: 10,
      });
    }
  } catch (e) {
    console.warn("[notify] applicant needs changes failed", e);
  }
}
