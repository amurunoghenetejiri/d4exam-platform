/**
 * Client-side push registration.
 *
 * Native Android APK:
 * - NEVER use web FCM / service worker / browser Notification (those show as Chrome)
 * - Use Capacitor permission + D4EXAM Local Notifications for system tray
 * - Do not call PushNotifications.register() without google-services (process crash)
 *
 * Web/PWA: Firebase web push (may show as Chrome — expected in browser only)
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { FIREBASE_WEB_CONFIG, FIREBASE_VAPID_KEY } from "@/lib/firebase-config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isNativeShell, getRuntimePlatform } from "@/native/platform";
import { showD4ExamNativeNotification, bindLocalNotificationActions } from "@/native/localNotify";
import { notificationsEnabledConfirm } from "@/lib/notify-messages";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let nativePermissionCache: "granted" | "denied" | "default" | "unsupported" | null = null;
let nativeListenersBound = false;

const ENABLE_NATIVE_FCM_REGISTER = false;

export type PushPermissionState = "granted" | "denied" | "default" | "unsupported";

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (isNativeShell()) {
    return nativePermissionCache || "default";
  }
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as PushPermissionState;
}

export async function refreshNativePushPermissionState(): Promise<PushPermissionState> {
  if (!isNativeShell()) return getPushPermissionState();
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") {
      nativePermissionCache = "granted";
      return "granted";
    }
    if (status.display === "denied") {
      nativePermissionCache = "denied";
      return "denied";
    }
  } catch {
    /* fall through */
  }
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.checkPermissions();
    if (status.receive === "granted") {
      nativePermissionCache = "granted";
      return "granted";
    }
    if (status.receive === "denied") {
      nativePermissionCache = "denied";
      return "denied";
    }
    nativePermissionCache = "default";
    return "default";
  } catch {
    nativePermissionCache = "unsupported";
    return "unsupported";
  }
}

async function disableWebPushInNativeShell(): Promise<void> {
  if (!isNativeShell() || typeof window === "undefined") return;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try {
          await reg.unregister();
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

async function disableWebPushDevicesForUser(userId: string): Promise<void> {
  if (!userId || !isNativeShell()) return;
  try {
    const { data } = await supabase
      .from("push_devices")
      .select("id, user_agent, token")
      .eq("user_id", userId)
      .eq("enabled", true);
    const rows = (data || []) as { id: string; user_agent?: string | null }[];
    for (const row of rows) {
      const ua = row.user_agent || "";
      const isNative = /native=1/i.test(ua) || /platform=android/i.test(ua);
      if (!isNative) {
        await supabase
          .from("push_devices")
          .update({ enabled: false, updated_at: new Date().toISOString() } as never)
          .eq("id", row.id);
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

function showLocalNotification(title: string, body: string, link?: string | null) {
  if (isNativeShell()) {
    void showD4ExamNativeNotification(title, body, link);
    return;
  }
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "/icon-192.png", badge: "/favicon.png" });
    if (link) {
      n.onclick = () => {
        window.focus();
        window.location.assign(link.startsWith("http") ? link : link);
        n.close();
      };
    }
  } catch {
    /* ignore */
  }
}

async function ensureAndroidChannel(): Promise<void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    if (typeof (PushNotifications as unknown as { createChannel?: unknown }).createChannel === "function") {
      await (PushNotifications as unknown as { createChannel: (opts: unknown) => Promise<void> }).createChannel({
        id: "d4exam_default",
        name: "D4EXAM",
        description: "Exams, results and important updates",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      });
    }
  } catch {
    /* ignore */
  }
}

async function bindNativePushListeners(userId: string, role?: string | null): Promise<void> {
  if (nativeListenersBound) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    await PushNotifications.addListener("registration", (token) => {
      void saveDeviceToken(userId, token.value, role);
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("[D4EXAM] push registration error", err);
    });

    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      try {
        const title = notification.title || "D4EXAM";
        const body = notification.body || "";
        const data = notification.data as Record<string, string> | undefined;
        toast.info(title, { description: body });
        void showD4ExamNativeNotification(title, body, data?.link);
        // If payload includes exam countdown start, client may start local live timer
        if (data?.examCountdown === "1" && data.examId && data.startIso) {
          void import("@/native/localNotify").then((m) => {
            m.startExamCountdownNotification({
              examId: data.examId!,
              studentName: data.studentName || "Student",
              courseCode: data.courseCode || data.examTitle || "Examination",
              startIso: data.startIso!,
              endIso: data.endIso || null,
              startLink: data.link || `/student/exam/${data.examId}`,
              viewLink: data.link || `/student/exam/${data.examId}`,
            });
          });
        }
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
    void bindLocalNotificationActions();
  } catch (e) {
    console.warn("[D4EXAM] bindNativePushListeners failed", e);
  }
}

async function enableNativePushNotifications(
  userId: string,
  role?: string | null,
  opts?: { requestPermission?: boolean },
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    await disableWebPushInNativeShell();
    await disableWebPushDevicesForUser(userId);

    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      let lp = await LocalNotifications.checkPermissions();
      const wasGranted = lp.display === "granted";
      if (!wasGranted && opts?.requestPermission !== false) {
        lp = await LocalNotifications.requestPermissions();
      }
      if (lp.display === "granted") {
        nativePermissionCache = "granted";
        // Confirmation ONLY when user just granted (not on every login)
        if (!wasGranted) {
          try {
            const key = `d4_notif_enabled_once:${userId}`;
            if (typeof localStorage !== "undefined" && localStorage.getItem(key) !== "1") {
              localStorage.setItem(key, "1");
              const copy = notificationsEnabledConfirm();
              const settings =
                role === "student"
                  ? "/student/settings"
                  : role === "teacher"
                    ? "/teacher/settings"
                    : role === "examination_officer"
                      ? "/officer/settings"
                      : role === "school_admin"
                        ? "/admin/settings"
                        : role === "super_admin"
                          ? "/super-admin/settings"
                          : "/";
              await showD4ExamNativeNotification(copy.title, copy.message, settings);
            }
          } catch {
            /* ignore storage */
          }
        }
      }
    } catch {
      /* plugin may be missing until next APK */
    }

    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive !== "granted" && opts?.requestPermission !== false) {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive === "granted") nativePermissionCache = "granted";

      if (permStatus.receive === "granted") {
        try {
          await ensureAndroidChannel();
          await bindNativePushListeners(userId, role);
        } catch {
          /* ignore */
        }
        if (ENABLE_NATIVE_FCM_REGISTER) {
          try {
            await PushNotifications.register();
          } catch {
            /* google-services may be missing */
          }
        }
      }
    } catch {
      /* ignore */
    }

    const token = `native-${userId}-${getRuntimePlatform()}`;
    await saveDeviceToken(userId, token, role);
    return { ok: true, token };
  } catch (e) {
    console.warn("[D4EXAM] enableNativePushNotifications failed", e);
    return { ok: false, error: (e as Error).message || "Native push failed" };
  }
}

async function saveDeviceToken(
  userId: string,
  token: string,
  role?: string | null,
): Promise<{ ok: boolean; error?: string }> {
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
    }
    return { ok: false, error: ins.error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function enableWebPushNotifications(
  userId: string,
  role?: string | null,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!userId) return { ok: false, error: "Sign in required" };
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

    const saved = await saveDeviceToken(userId, token, role);
    if (!saved.ok) return { ok: false, error: saved.error || "Could not save device" };

    onMessage(msg, (payload) => {
      try {
        const title = payload.notification?.title || payload.data?.title || "D4EXAM";
        const body =
          payload.notification?.body || payload.data?.body || payload.data?.message || "";
        const link = payload.data?.link;
        showLocalNotification(title, body, link);
        toast.info(title, { description: body });
      } catch {
        /* ignore */
      }
    });

    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Push registration failed" };
  }
}

export async function enablePushNotifications(
  userId: string,
  role?: string | null,
  opts?: { requestPermission?: boolean },
): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!userId) return { ok: false, error: "Sign in required" };
  if (isNativeShell()) {
    await disableWebPushInNativeShell();
    return enableNativePushNotifications(userId, role, {
      requestPermission: opts?.requestPermission !== false,
    });
  }
  if (opts?.requestPermission === false) {
    const st = typeof Notification !== "undefined" ? Notification.permission : "denied";
    if (st === "granted") return enableWebPushNotifications(userId, role);
    return { ok: true };
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
  userId?: string | null,
  role?: string | null,
): Promise<void> {
  if (!isNativeShell()) return;
  try {
    await disableWebPushInNativeShell();
    if (userId) await disableWebPushDevicesForUser(userId);
    if (!userId) return;
    const state = await refreshNativePushPermissionState();
    if (state === "granted") {
      await enableNativePushNotifications(userId, role, { requestPermission: false });
    }
  } catch {
    /* ignore */
  }
}
