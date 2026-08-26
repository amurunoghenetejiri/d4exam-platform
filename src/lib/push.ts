/**
 * Client-side push registration.
 *
 * Android Capacitor (CRITICAL):
 * PushNotifications.register() starts Firebase Messaging. Without
 * google-services.json in the APK, the native process is KILLED — not a JS
 * exception. We therefore NEVER call register() until FCM is confirmed present.
 *
 * Allow notifications only: requestPermissions + notification channel + listeners.
 * In-app notifications (Supabase) still work. System FCM needs google-services.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { FIREBASE_WEB_CONFIG, FIREBASE_VAPID_KEY } from "@/lib/firebase-config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isNativeShell, getRuntimePlatform } from "@/native/platform";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let onMessageBound = false;
let nativeListenersBound = false;
let nativePermissionCache: PushPermissionState | null = null;

/**
 * Set true ONLY after google-services.json is in the APK and FCM is verified.
 * Default false = app never crashes on Allow / reopen.
 */
const ENABLE_NATIVE_FCM_REGISTER = false;

async function disableWebPushInNativeShell(): Promise<void> {
  if (typeof window === "undefined" || !isNativeShell()) return;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(async (r) => {
          try {
            await r.unregister();
          } catch {
            /* ignore */
          }
        }),
      );
    }
    if ("caches" in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => /firebase|messaging|fcm|workbox/i.test(k))
            .map((k) => caches.delete(k)),
        );
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps().length ? getApps()[0]! : initializeApp(FIREBASE_WEB_CONFIG);
  return app;
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (isNativeShell()) return null;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  if (messaging) return messaging;
  messaging = getMessaging(getFirebaseApp());
  return messaging;
}

export type PushPermissionState = "granted" | "denied" | "default" | "unsupported";

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeShell()) {
    if (nativePermissionCache) return nativePermissionCache;
    return "default";
  }
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as PushPermissionState;
}

export async function refreshNativePushPermissionState(): Promise<PushPermissionState> {
  if (!isNativeShell()) return getPushPermissionState();
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.checkPermissions();
    const state: PushPermissionState =
      status.receive === "granted"
        ? "granted"
        : status.receive === "denied"
          ? "denied"
          : "default";
    nativePermissionCache = state;
    return state;
  } catch {
    nativePermissionCache = "default";
    return "default";
  }
}

async function upsertPushDevice(
  userId: string,
  token: string,
  role?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!userId || !token) return { ok: false, error: "Missing user or token" };

  const ua =
    typeof navigator !== "undefined"
      ? `${navigator.userAgent} | platform=${getRuntimePlatform()} | native=${isNativeShell() ? "1" : "0"}`
      : `platform=${getRuntimePlatform()}`;

  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    token,
    role: role || null,
    user_agent: ua.slice(0, 400),
    enabled: true,
    last_seen_at: now,
    updated_at: now,
  };

  try {
    const upd = await supabase
      .from("push_devices")
      .update({
        role: role || null,
        user_agent: ua.slice(0, 400),
        enabled: true,
        last_seen_at: now,
        updated_at: now,
      } as never)
      .eq("token", token)
      .eq("user_id", userId)
      .select("id");

    if (!upd.error && upd.data && (upd.data as { id: string }[]).length > 0) {
      return { ok: true };
    }

    const ins = await supabase.from("push_devices").insert(row as never).select("id");
    if (!ins.error) return { ok: true };

    const msg = ins.error.message || "";
    if (/duplicate|unique|push_devices_token/i.test(msg)) {
      const again = await supabase
        .from("push_devices")
        .update({
          user_id: userId,
          role: role || null,
          user_agent: ua.slice(0, 400),
          enabled: true,
          last_seen_at: now,
          updated_at: now,
        } as never)
        .eq("token", token);
      if (!again.error) return { ok: true };
      return { ok: false, error: again.error.message };
    }

    if (/duplicate|unique/i.test(msg)) return { ok: true };
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not save device" };
  }
}

function showLocalNotification(title: string, body: string, link?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (isNativeShell()) return;
  if (Notification.permission !== "granted") return;
  const icon = `${window.location.origin}/logo.png`;
  try {
    const n = new Notification(title, {
      body,
      icon,
      badge: icon,
      tag: "d4exam-notification",
      data: { link: link || "/" },
    });
    n.onclick = () => {
      window.focus();
      if (link) {
        try {
          window.location.assign(link.startsWith("http") ? link : link);
        } catch {
          /* ignore */
        }
      }
      n.close();
    };
  } catch {
    /* ignore */
  }
}

async function ensureAndroidChannel(): Promise<void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.createChannel({
      id: "d4exam_default",
      name: "D4EXAM",
      description: "Exams, results and important updates",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
      lights: true,
    });
  } catch {
    /* ignore — channel is optional */
  }
}

async function bindNativePushListeners(userId: string, role?: string | null) {
  if (nativeListenersBound) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    await PushNotifications.addListener("registration", (token) => {
      if (token?.value) {
        void upsertPushDevice(userId, token.value, role);
      }
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("[D4EXAM] Push registration error", err);
    });

    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      try {
        const title = notification.title || "D4EXAM";
        const body = notification.body || "";
        toast.info(title, { description: body });
      } catch {
        /* ignore */
      }
    });

    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      try {
        const data = action.notification?.data as Record<string, string> | undefined;
        const link = data?.link || data?.url;
        if (link && typeof window !== "undefined") {
          window.location.assign(link.startsWith("http") ? link : link);
        }
      } catch {
        /* ignore */
      }
    });

    nativeListenersBound = true;
  } catch (e) {
    console.warn("[D4EXAM] bindNativePushListeners failed", e);
  }
}

/**
 * Intentionally does NOT call PushNotifications.register() by default.
 * That native call crashes the APK when Firebase is not configured.
 */
async function enableNativePushNotifications(
  userId: string,
  role?: string | null,
  opts?: { requestPermission?: boolean },
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    await disableWebPushInNativeShell();
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive !== "granted" && opts?.requestPermission !== false) {
      try {
        permStatus = await PushNotifications.requestPermissions();
      } catch (permErr) {
        console.warn("[D4EXAM] requestPermissions failed", permErr);
        return { ok: false, error: "Could not request notification permission" };
      }
    }

    const state: PushPermissionState =
      permStatus.receive === "granted"
        ? "granted"
        : permStatus.receive === "denied"
          ? "denied"
          : "default";
    nativePermissionCache = state;

    if (permStatus.receive !== "granted") {
      return {
        ok: false,
        error:
          permStatus.receive === "denied"
            ? "Permission denied. Enable notifications in Android Settings → Apps → D4EXAM."
            : "Permission not granted",
      };
    }

    // Safe only — never register FCM here
    try {
      await ensureAndroidChannel();
    } catch {
      /* ignore */
    }
    try {
      await bindNativePushListeners(userId, role);
    } catch {
      /* ignore */
    }

    // Optional FCM (disabled until google-services.json is in the APK)
    if (ENABLE_NATIVE_FCM_REGISTER) {
      try {
        await PushNotifications.register();
      } catch (e) {
        console.warn("[D4EXAM] FCM register skipped/failed", e);
      }
    }

    return { ok: true };
  } catch (e) {
    console.warn("[D4EXAM] enableNativePushNotifications failed", e);
    return { ok: false, error: (e as Error).message || "Native push setup failed" };
  }
}

async function enableWebPushNotifications(
  userId: string,
  role?: string | null,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (isNativeShell()) {
    return enableNativePushNotifications(userId, role, { requestPermission: true });
  }
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, error: "Notifications are not supported in this browser" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        ok: false,
        error: permission === "denied" ? "Permission denied" : "Permission not granted",
      };
    }

    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
    }

    const msg = await getFirebaseMessaging();
    if (!msg) return { ok: false, error: "Messaging not supported" };

    const reg = await navigator.serviceWorker.getRegistration();
    const token = await getToken(msg, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    if (!token) return { ok: false, error: "Could not get push token" };

    const saved = await upsertPushDevice(userId, token, role);
    if (!saved.ok) return { ok: false, error: saved.error };

    if (!onMessageBound) {
      onMessageBound = true;
      onMessage(msg, (payload) => {
        const title = payload.notification?.title || payload.data?.title || "D4EXAM";
        const body =
          payload.notification?.body || payload.data?.body || payload.data?.message || "";
        const link = payload.data?.link;
        showLocalNotification(title, body, link);
        toast.info(title, { description: body });
      });
    }

    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Push registration failed" };
  }
}

export async function enablePushNotifications(
  userId: string,
  role?: string | null,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!userId) return { ok: false, error: "Sign in required" };
  if (isNativeShell()) {
    await disableWebPushInNativeShell();
    return enableNativePushNotifications(userId, role, { requestPermission: true });
  }
  return enableWebPushNotifications(userId, role);
}

export async function refreshPushLastSeen(userId: string): Promise<void> {
  if (!userId) return;
  if (isNativeShell()) return;
  try {
    const msg = await getFirebaseMessaging();
    if (!msg) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const token = await getToken(msg, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: reg || undefined,
    }).catch(() => null);
    if (!token) return;
    await supabase
      .from("push_devices")
      .update({ last_seen_at: new Date().toISOString(), enabled: true } as never)
      .eq("token", token)
      .eq("user_id", userId);
  } catch {
    /* ignore */
  }
}

/**
 * Native session bootstrap — permission check + channel only.
 * Never calls PushNotifications.register() (that was the crash).
 */
export async function initNativePushIfNeeded(
  userId?: string | null,
  role?: string | null,
): Promise<void> {
  if (!isNativeShell()) return;
  try {
    await disableWebPushInNativeShell();
    if (!userId) return;
    const state = await refreshNativePushPermissionState();
    if (state === "granted") {
      try {
        await ensureAndroidChannel();
        await bindNativePushListeners(userId, role);
      } catch {
        /* ignore */
      }
      // Do NOT call register() — crashes without google-services.json
    }
  } catch {
    /* never crash startup */
  }
}
