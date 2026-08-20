/**
 * Per-user notification preference flags (client-side).
 * Stored in localStorage so Settings toggles actually persist without schema changes.
 * Keys match SettingsPage toggle ids: n1–n4.
 */

export type NotificationPrefs = {
  /** Examination reminders (exam_scheduled, exam_available, exam_submitted, …) */
  examReminders: boolean;
  /** Result publications (result_published, result_pending_release) */
  resultPublications: boolean;
  /** Integrity / officer warnings / system alerts */
  integrityAlerts: boolean;
  /** Product announcements */
  productAnnouncements: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  examReminders: true,
  resultPublications: true,
  integrityAlerts: true,
  productAnnouncements: false,
};

function storageKey(userId: string) {
  return `d4exam_notif_prefs:${userId}`;
}

export function loadNotificationPrefs(userId: string | null | undefined): NotificationPrefs {
  if (!userId || typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      examReminders: parsed.examReminders !== false,
      resultPublications: parsed.resultPublications !== false,
      integrityAlerts: parsed.integrityAlerts !== false,
      productAnnouncements: parsed.productAnnouncements === true,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function saveNotificationPrefs(
  userId: string | null | undefined,
  prefs: NotificationPrefs,
): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** Map notification `type` to preference buckets. System/error always allowed. */
export function isNotificationTypeAllowed(
  type: string | null | undefined,
  prefs: NotificationPrefs,
): boolean {
  const t = String(type || "info").toLowerCase();
  if (t === "error" || t === "system_alert") return prefs.integrityAlerts !== false;
  if (
    t === "result_published" ||
    t === "result_pending_release" ||
    t.includes("result")
  ) {
    return prefs.resultPublications !== false;
  }
  if (
    t === "officer_warning" ||
    t === "warning" ||
    t.includes("integrity") ||
    t.includes("violation")
  ) {
    return prefs.integrityAlerts !== false;
  }
  if (t === "announcement") return prefs.productAnnouncements === true;
  if (
    t.includes("exam") ||
    t === "exam_submitted" ||
    t === "exam_approved" ||
    t === "exam_rejected" ||
    t === "exam_revision_requested" ||
    t === "exam_scheduled" ||
    t === "exam_available" ||
    t === "info" ||
    t === "success"
  ) {
    return prefs.examReminders !== false;
  }
  return true;
}
