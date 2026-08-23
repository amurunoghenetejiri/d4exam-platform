import { notifySuperAdminsOfApplication as notifyCore } from "@/lib/notify";

/** Notify every super_admin when a school application is submitted (in-app + push). */
export async function notifySuperAdminsOfApplication(
  schoolName: string,
  applicationId: string,
  trackingCode?: string,
) {
  try {
    await notifyCore({ schoolName, applicationId, trackingCode });
  } catch {
    // never block submit
  }
}
