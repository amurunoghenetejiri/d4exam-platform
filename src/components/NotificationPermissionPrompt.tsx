/**
 * Soft prompt after login / application — does not block UI.
 * Asks once per role until granted or dismissed.
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

const PROMPT_KEY = "d4_notif_prompt_v1";

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

export function NotificationPermissionPrompt() {
  const { data: session } = useSessionUser();
  const fired = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session?.userId || !session.role) return;
    if (fired.current) return;

    const run = async () => {
      if (alreadyPrompted(session.userId, session.role)) return;

      let state = getPushPermissionState();
      if (isNativeShell()) {
        state = await refreshNativePushPermissionState();
      }
      if (state === "granted" || state === "denied" || state === "unsupported") {
        markPrompted(session.userId, session.role);
        try {
          if (state === "granted") {
            localStorage.setItem(`d4_notif_enabled_once:${session.userId}`, "1");
            localStorage.setItem(`d4_push_prompted:${session.userId}`, "1");
          }
        } catch {
          /* ignore */
        }
        return;
      }

      // Delay so login UI settles
      await new Promise((r) => setTimeout(r, 1800));
      if (fired.current) return;
      fired.current = true;
      markPrompted(session.userId, session.role);

      toast.message("Stay updated on D4EXAM", {
        description:
          "Enable notifications for exams, results, and important school updates. You can change this later in Settings.",
        duration: 12_000,
        action: {
          label: "Enable",
          onClick: () => {
            if (busy) return;
            setBusy(true);
            void enablePushNotifications(session.userId, session.role)
              .then((r) => {
                if (r.ok) toast.success("Notifications enabled");
                else toast.error(r.error || "Could not enable notifications");
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
    localStorage.setItem(key, "1");
    toast.message("Get application updates", {
      description:
        "Enable notifications so you are alerted when your school application is reviewed or approved.",
      duration: 14_000,
      action: {
        label: "Enable",
        onClick: () => {
          if (opts?.userId) {
            void enablePushNotifications(opts.userId, opts.role || null).then((r) => {
              if (r.ok) toast.success("Notifications enabled");
              else toast.error(r.error || "Could not enable");
            });
          } else if (isNativeShell()) {
            void import("@capacitor/local-notifications").then(async ({ LocalNotifications }) => {
              await LocalNotifications.requestPermissions();
              toast.success("Notifications enabled on this device");
            }).catch(() => {
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
