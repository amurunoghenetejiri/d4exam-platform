/**
 * Per-user notification preference flags.
 * Dual-write: localStorage (instant) + profiles.settings (cross-device when column exists).
 */

import { supabase } from "@/integrations/supabase/client";

export type NotificationPrefs = {
  examReminders: boolean;
  resultPublications: boolean;
  integrityAlerts: boolean;
  productAnnouncements: boolean;
};

export type DisplayPrefs = {
  language: string;
  timezone: string;
  compactTables: boolean;
  reducedMotion: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  examReminders: true,
  resultPublications: true,
  integrityAlerts: true,
  productAnnouncements: false,
};

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  language: "en",
  timezone: "wat",
  compactTables: false,
  reducedMotion: false,
};

function storageKey(userId: string) {
  return `d4exam_notif_prefs:${userId}`;
}

function displayKey(userId: string) {
  return `d4exam_display_prefs:${userId}`;
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

export function loadDisplayPrefs(userId: string | null | undefined): DisplayPrefs {
  if (!userId || typeof window === "undefined") return { ...DEFAULT_DISPLAY_PREFS };
  try {
    const raw = localStorage.getItem(displayKey(userId));
    if (!raw) {
      return {
        ...DEFAULT_DISPLAY_PREFS,
        compactTables: localStorage.getItem(`d4exam_pref_compact:${userId}`) === "1",
        reducedMotion: localStorage.getItem(`d4exam_pref_reduced:${userId}`) === "1",
      };
    }
    const parsed = JSON.parse(raw) as Partial<DisplayPrefs>;
    return {
      language: parsed.language || "en",
      timezone: parsed.timezone || "wat",
      compactTables: parsed.compactTables === true,
      reducedMotion: parsed.reducedMotion === true,
    };
  } catch {
    return { ...DEFAULT_DISPLAY_PREFS };
  }
}

export function saveDisplayPrefs(userId: string | null | undefined, prefs: DisplayPrefs): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    localStorage.setItem(displayKey(userId), JSON.stringify(prefs));
    localStorage.setItem(`d4exam_pref_compact:${userId}`, prefs.compactTables ? "1" : "0");
    localStorage.setItem(`d4exam_pref_reduced:${userId}`, prefs.reducedMotion ? "1" : "0");
    try {
      document.documentElement.classList.toggle("reduce-motion", prefs.reducedMotion);
      document.documentElement.dataset.compactTables = prefs.compactTables ? "1" : "0";
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

export async function hydratePrefsFromDb(
  userId: string,
  profileId?: string | null,
): Promise<{ notif: NotificationPrefs; display: DisplayPrefs }> {
  const localNotif = loadNotificationPrefs(userId);
  const localDisplay = loadDisplayPrefs(userId);
  try {
    let q = supabase.from("profiles").select("settings");
    if (profileId) q = q.eq("id", profileId);
    else q = q.eq("auth_user_id", userId);
    const { data, error } = await q.maybeSingle();
    if (error || !data) return { notif: localNotif, display: localDisplay };
    const settings = (data as { settings?: Record<string, unknown> | null }).settings || {};
    const n = (settings.notifications || {}) as Partial<NotificationPrefs>;
    const d = (settings.display || {}) as Partial<DisplayPrefs>;
    const notif: NotificationPrefs = {
      examReminders: n.examReminders !== false,
      resultPublications: n.resultPublications !== false,
      integrityAlerts: n.integrityAlerts !== false,
      productAnnouncements: n.productAnnouncements === true,
    };
    const display: DisplayPrefs = {
      language: typeof d.language === "string" ? d.language : localDisplay.language,
      timezone: typeof d.timezone === "string" ? d.timezone : localDisplay.timezone,
      compactTables: d.compactTables === true,
      reducedMotion: d.reducedMotion === true,
    };
    saveNotificationPrefs(userId, notif);
    saveDisplayPrefs(userId, display);
    return { notif, display };
  } catch {
    return { notif: localNotif, display: localDisplay };
  }
}

export async function persistPrefsToDb(
  userId: string,
  profileId: string | null | undefined,
  notif: NotificationPrefs,
  display: DisplayPrefs,
): Promise<void> {
  saveNotificationPrefs(userId, notif);
  saveDisplayPrefs(userId, display);
  const payload = {
    settings: {
      notifications: notif,
      display,
    },
  };
  try {
    if (profileId) {
      await supabase.from("profiles").update(payload as never).eq("id", profileId);
    } else {
      await supabase.from("profiles").update(payload as never).eq("auth_user_id", userId);
    }
  } catch {
    /* column may not exist yet */
  }
}

export function isNotificationTypeAllowed(
  type: string | null | undefined,
  prefs: NotificationPrefs,
): boolean {
  const t = String(type || "info").toLowerCase();
  if (t === "error" || t === "system_alert") return prefs.integrityAlerts !== false;
  if (t === "result_published" || t === "result_pending_release" || t.includes("result")) {
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
