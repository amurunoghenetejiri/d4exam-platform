/**
 * Client-side push registration (FCM web).
 * Saves device tokens to public.push_devices for the signed-in user.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { FIREBASE_WEB_CONFIG, FIREBASE_VAPID_KEY } from "@/lib/firebase-config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let onMessageBound = false;

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
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushPermissionState;
}

export async function enablePushNotifications(userId: string, role?: string | null): Promise<{
  ok: boolean;
  token?: string;
  error?: string;
}> {
  if (!userId) return { ok: false, error: "Sign in required" };
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, error: "Notifications are not supported in this browser" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, error: permission === "denied" ? "Permission denied" : "Permission not granted" };
    }

    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      // Activate new SW so duplicate-push fix applies immediately
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }

    const msg = await getFirebaseMessaging();
    if (!msg) return { ok: false, error: "Messaging not supported" };

    const reg = await navigator.serviceWorker.getRegistration();
    const token = await getToken(msg, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    if (!token) return { ok: false, error: "Could not get push token" };

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
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

    if (!onMessageBound) {
      onMessageBound = true;
      // Foreground: in-app toast ONLY. Do not call new Notification()
      // (that creates a second Chrome-branded system alert).
      onMessage(msg, (payload) => {
        const title = payload.notification?.title || payload.data?.title || "D4EXAM";
        const body =
          payload.notification?.body || payload.data?.body || payload.data?.message || "";
        toast.info(title, { description: body });
      });
    }

    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Push registration failed" };
  }
}

export async function refreshPushLastSeen(userId: string): Promise<void> {
  if (!userId) return;
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
