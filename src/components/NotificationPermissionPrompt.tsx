/**
 * Soft prompt after login — does not block UI.
 * NEVER re-ask if permission already granted.
 * Confirmation native notification only when user JUST enables.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSessionUser } from "@/lib/session";
import {
  enablePushNotifications,
  getPushPermissionState,
  refreshNativePushPermissionState,
} from "@/lib/push";
import { isNativeShell } from "@/native/platform";
import { notificationsEnabledConfirm } from "@/lib/notify-messages";
import { showD4ExamNativeNotification } from "@/native/localNotify";

const PROMPT_KEY = "d4_notif_prompt_v2";

function alreadyPrompted(userId: string, role: string): boolean {
  try {
    return localStorage.getItem(`${PROMPT_KEY}:${userId}:${role}`) === "1";
  } catch {
    return false;
  }
}

function markPrompted(userId: string, role: string) {
  try {
    localStorage.setItem(`${PROMPT_KEY}:${userId}:${role}`, "1");
  } catch {
    /* ignore */
  }
}

function settingsLinkForRole(role?: string | null): string {
  const r = (role || "").toLowerCase();
  if (r.includes("super")) return "/super-admin/settings";
  if (r.includes("school") || r === "admin") return "/admin/settings";
  if (r.includes("officer")) return "/officer/settings";
  if (r.includes("teacher")) return "/teacher/settings";
  if (r.includes("student")) return "/student/settings";
  return "/";
}

export function NotificationPermissionPrompt() {
  const { data: session } = useSessionUser();
  const fired = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const uid: string | null | undefined = session?.userId;
    const role: string | null | undefined = session?.role;
    if (!uid || !role) return;
    if (fired.current) return;

    const run = async () => {
      if (alreadyPrompted(uid, role)) return;

      let state = getPushPermissionState();
      if (isNativeShell()) {
        state = await refreshNativePushPermissionState();
      }

      // Already granted / denied / unsupported → NEVER show Allow prompt again
      if (state === "granted" || state === "denied" || state === "unsupported") {
        markPrompted(uid, role);
        try {
          if (state === "granted") {
            localStorage.setItem(`d4_notif_enabled_once:${uid}`, "1");
            localStorage.setItem(`d4_push_prompted:${uid}`, "1");
          }
        } catch {
          /* ignore */
        }
        return;
      }

      await new Promise((r) => setTimeout(r, 1800));
      if (fired.current) return;
      fired.current = true;
      markPrompted(uid, role);

      toast.message("Stay updated with D4EXAM 🔔", {
        description:
          "Allow notifications to receive: exam reminders, examination approvals, result releases, important security alerts, and school/application updates.",
        duration: 14_000,
        action: {
          label: "Allow Notifications",
          onClick: () => {
            if (busy) return;
            setBusy(true);
            void enablePushNotifications(uid, role)
              .then(async (r) => {
                if (r.ok) {
                  toast.success("Notifications enabled");
                  // One-time confirmation notification (native D4EXAM, not Chrome)
                  try {
                    const key = `d4_notif_enabled_once:${uid}`;
                    if (localStorage.getItem(key) !== "1") {
                      localStorage.setItem(key, "1");
                      const copy = notificationsEnabledConfirm();
                      if (isNativeShell()) {
                        await showD4ExamNativeNotification(
                          copy.title,
                          copy.message,
                          settingsLinkForRole(role),
                        );
                      }
                    }
                  } catch {
                    /* ignore */
                  }
                } else toast.error(r.error || "Could not enable notifications");
              })
              .finally(() => setBusy(false));
          },
        },
      });
    };

    void run();
  }, [session?.userId, session?.role, busy]);

  return null;
}

/** Call after school application submit (optional applicant userId). */
export function promptNotificationsAfterApplication(opts?: {
  userId?: string | null;
  role?: string | null;
}) {
  try {
    if (typeof window === "undefined") return;
    const key = `d4_app_prompt:${opts?.userId || "anon"}`;
    if (localStorage.getItem(key) === "1") return;

    // If already granted, never show enable prompt
    const state = getPushPermissionState();
    if (state === "granted" || state === "denied") {
      localStorage.setItem(key, "1");
      return;
    }

    localStorage.setItem(key, "1");
    toast.message("Get application updates", {
      description:
        "Enable notifications so you are alerted when your school application is reviewed or approved.",
      duration: 14_000,
      action: {
        label: "Enable",
        onClick: () => {
          if (opts?.userId) {
            void enablePushNotifications(opts.userId, opts.role || null).then(async (r) => {
              if (r.ok) {
                toast.success("Notifications enabled");
                const copy = notificationsEnabledConfirm();
                if (isNativeShell()) {
                  await showD4ExamNativeNotification(copy.title, copy.message, "/application-status");
                }
              } else toast.error(r.error || "Could not enable");
            });
          } else if (isNativeShell()) {
            void import("@capacitor/local-notifications")
              .then(async ({ LocalNotifications }) => {
                await LocalNotifications.requestPermissions();
                toast.success("Notifications enabled on this device");
              })
              .catch(() => {
                toast.message("Open Settings later to enable notifications after you sign in.");
              });
          } else if ("Notification" in window) {
            void Notification.requestPermission().then((p) => {
              if (p === "granted") toast.success("Notifications enabled");
            });
          }
        },
      },
    });
  } catch {
    /* ignore */
  }
}
