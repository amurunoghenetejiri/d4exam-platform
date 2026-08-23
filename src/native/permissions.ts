/**
 * Contextual native permission helpers for Capacitor Android.
 */
import { isNativeShell } from "@/native/platform";

export async function requestNotificationPermissionNative(): Promise<
  "granted" | "denied" | "prompt"
> {
  if (!isNativeShell()) return "prompt";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let s = await PushNotifications.checkPermissions();
    if (s.receive === "granted") return "granted";
    if (s.receive === "denied") return "denied";
    s = await PushNotifications.requestPermissions();
    return s.receive === "granted" ? "granted" : s.receive === "denied" ? "denied" : "prompt";
  } catch {
    return "prompt";
  }
}

export async function requestCameraPermissionNative(): Promise<
  "granted" | "denied" | "prompt"
> {
  if (!isNativeShell()) return "prompt";
  try {
    const { Camera } = await import("@capacitor/camera");
    let s = await Camera.checkPermissions();
    if (s.camera === "granted") return "granted";
    s = await Camera.requestPermissions({ permissions: ["camera"] });
    return s.camera === "granted" ? "granted" : s.camera === "denied" ? "denied" : "prompt";
  } catch {
    return "prompt";
  }
}
