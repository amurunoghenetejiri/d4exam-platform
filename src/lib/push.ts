/**
 * Client-side push registration.
 * - Web/PWA: Firebase Cloud Messaging (browser)
 * - Android Capacitor: @capacitor/push-notifications (native FCM)
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
let nativeRegisterInFlight = false;

const NATIVE_PUSH_SKIP_KEY = "d4_native_push_skip_register";

function shouldSkipNativeRegister(): boolean {
  try {
    return localStorage.getItem(NATIVE_PUSH_SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function markNativeRegisterUnsafe(): void {
  try {
    localStorage.setItem(NATIVE_PUSH_SKIP_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearNativeRegisterSkip(): void {
  try {
    localStorage.removeItem(NATIVE_PUSH_SKIP_KEY);
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

/**
 * Save device token without hitting unique constraint errors.
 * Strategy: update-by-token first; if no row, insert; if insert races, update again.
 */
async function upsertPushDevice(
  userId: string,
  token: string,
  role?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!userId || !token) return { ok: false, error: "Missing user or token" };

  const ua =
    typeof navigator !== "undefined"
      ? `${navigator.userAgent} | platform=${getRuntimePlatform()}`
      : `platform=${getRuntimePlatform()}`;

  const row = {
    user_id: userId,
    token,
    role: role || null,
    user_agent: ua.slice(0, 400),
    enabled: true,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    // 1) Prefer update existing token row (handles re-enable / same device)
    const upd = await supabase
      .from("push_devices")
      .update({
        user_id: userId,
        role: role || null,
        user_agent: ua.slice(0, 400),
        enabled: true,
        last_seen_at: row.last_seen_at,
        updated_at: row.updated_at,
      } as never)
      .eq("token", token)
      .select("id");

    if (!upd.error && upd.data && (upd.data as { id: string }[]).length > 0) {
      return { ok: true };
    }

    // 2) Insert new token
    const ins = await supabase.from("push_devices").insert(row as never).select("id");
    if (!ins.error) return { ok: true };

    const msg = ins.error.message || "";
    // 3) Race / unique: token already exists — update again
    if (/duplicate|unique|push_devices_token/i.test(msg)) {
      const again = await supabase
        .from("push_devices")
        .update({
          user_id: userId,
          role: role || null,
          user_agent: ua.slice(0, 400),
          enabled: true,
          last_seen_at: row.last_seen_at,
          updated_at: row.updated_at,
        } as never)
        .eq("token", token);
      if (!again.error) return { ok: true };
      return { ok: false, error: again.error.message };
    }

    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not save device" };
  }
}

function showLocalNotification(title: string, body: string, link?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const icon = `${window.location.origin}/icon-192.png`;
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
      importance: 4,
      visibility: 1,
      sound: "default",
      vibration: true,
    });
  } catch {
    /* channels unsupported or already exist */
  }
}

async function bindNativePushListeners(userId: string, role?: string | null) {
  if (nativeListenersBound) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    try {
      await PushNotifications.removeAllListeners();
    } catch {
      /* ignore */
    }

    await PushNotifications.addListener("registration", (token) => {
      clearNativeRegisterSkip();
      if (token?.value) {
        void upsertPushDevice(userId, token.value, role);
      }
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("[D4EXAM] Push registration error", err);
      markNativeRegisterUnsafe();
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

async function safeNativeRegister(): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (shouldSkipNativeRegister()) {
    return {
      ok: false,
      error:
        "Push registration was disabled after a previous failure. Rebuild the APK with google-services.json, then clear app storage or tap Enable again.",
    };
  }
  if (nativeRegisterInFlight) {
    return { ok: false, error: "Registration already in progress" };
  }
  nativeRegisterInFlight = true;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await ensureAndroidChannel();

    const tokenPromise = new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 8_000);
      void PushNotifications.addListener("registration", (t) => {
        clearTimeout(timeout);
        resolve(t?.value || null);
      }).catch(() => {
        clearTimeout(timeout);
        resolve(null);
      });
      void PushNotifications.addListener("registrationError", () => {
        clearTimeout(timeout);
        markNativeRegisterUnsafe();
        resolve(null);
      }).catch(() => {
        clearTimeout(timeout);
        resolve(null);
      });
    });

    await PushNotifications.register();
    const token = await tokenPromise;
    if (token) {
      clearNativeRegisterSkip();
      return { ok: true, token };
    }
    return { ok: true };
  } catch (e) {
    markNativeRegisterUnsafe();
    return { ok: false, error: (e as Error).message || "Native push registration failed" };
  } finally {
    nativeRegisterInFlight = false;
  }
}

async function enableNativePushNotifications(
  userId: string,
  role?: string | null,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive !== "granted") {
      permStatus = await PushNotifications.requestPermissions();
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

    await bindNativePushListeners(userId, role);
    clearNativeRegisterSkip();
    const reg = await safeNativeRegister();
    if (reg.token) {
      const saved = await upsertPushDevice(userId, reg.token, role);
      if (!saved.ok) return { ok: false, error: saved.error };
      return { ok: true, token: reg.token };
    }
    return { ok: true, error: reg.error };
  } catch (e) {
    markNativeRegisterUnsafe();
    return { ok: false, error: (e as Error).message || "Native push registration failed" };
  }
}

async function enableWebPushNotifications(
  userId: string,
  role?: string | null,
): Promise<{ ok: boolean; token?: string; error?: string }> {
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
    return enableNativePushNotifications(userId, role);
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

export async function initNativePushIfNeeded(
  _userId?: string | null,
  _role?: string | null,
): Promise<void> {
  if (!isNativeShell()) return;
  try {
    await refreshNativePushPermissionState();
  } catch {
    /* never crash startup */
  }
}
