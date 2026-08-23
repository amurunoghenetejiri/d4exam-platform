/**
 * Client-side push registration.
 * - Web/PWA: Firebase Cloud Messaging (browser)
 * - Android Capacitor: @capacitor/push-notifications (native FCM)
 *
 * IMPORTANT (Android):
 * PushNotifications.register() talks to native FCM. Without google-services.json
 * in the APK, the native layer can kill the process — JS try/catch cannot stop that.
 * Therefore we never auto-register on every app open after a failed/crashing attempt.
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

async function upsertPushDevice(
  userId: string,
  token: string,
  role?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const ua =
    typeof navigator !== "undefined"
      ? `${navigator.userAgent} | platform=${getRuntimePlatform()}`
      : `platform=${getRuntimePlatform()}`;
  try {
    const { error } = await supabase.from("push_devices").upsert(
      {
        user_id: userId,
        token,
        role: role || null,
        user_agent: ua.slice(0, 400),
        enabled: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "token" },
    );
    if (error) {
      const ins = await supabase.from("push_devices").insert({
        user_id: userId,
        token,
        role: role || null,
        user_agent: ua.slice(0, 400),
        enabled: true,
        last_seen_at: new Date().toISOString(),
      } as never);
      if (ins.error) return { ok: false, error: ins.error.message };
    }
    return { ok: true };
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

    // Avoid duplicate listeners across re-logins
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

/** Soft FCM register — never throws; may no-op if previously unsafe. */
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

    // Native FCM register — if google-services.json is missing this can kill the process.
    // We still call it once when the user explicitly enables notifications.
    await PushNotifications.register();
    const token = await tokenPromise;
    if (token) {
      clearNativeRegisterSkip();
      return { ok: true, token };
    }
    // No token within timeout — do not mark skip permanently (FCM may be slow)
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

    // Permission alone is enough for OS dialogs; FCM register is optional/best-effort
    await bindNativePushListeners(userId, role);

    // User explicitly enabled — allow one more attempt even if previously marked unsafe
    clearNativeRegisterSkip();
    const reg = await safeNativeRegister();
    if (reg.token) {
      const saved = await upsertPushDevice(userId, reg.token, role);
      if (!saved.ok) return { ok: false, error: saved.error };
      return { ok: true, token: reg.token };
    }
    // Granted permission counts as success for UX even if FCM token missing
    return {
      ok: true,
      error: reg.error,
    };
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

/**
 * Startup hook for Capacitor.
 * Only reads permission + attaches listeners.
 * Does NOT call PushNotifications.register() automatically — that was causing
 * the reopen crash loop when FCM/google-services.json was missing from the APK.
 */
export async function initNativePushIfNeeded(
  _userId?: string | null,
  _role?: string | null,
): Promise<void> {
  if (!isNativeShell()) return;
  try {
    await refreshNativePushPermissionState();
    // Intentionally no register() on cold start.
  } catch {
    /* never crash startup */
  }
}
