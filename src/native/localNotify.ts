/**
 * Show a system notification as D4EXAM (app icon), never Chrome.
 * Uses Capacitor Local Notifications when available; safe no-op on web.
 */
import { isNativeShell } from "@/native/platform";

let channelReady = false;
let idSeq = Math.floor(Date.now() % 100000);

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.createChannel({
      id: "d4exam_default",
      name: "D4EXAM",
      description: "Exams, results and important updates",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
      lights: true,
    });
    channelReady = true;
  } catch {
    // Plugin missing or channel exists
    channelReady = true;
  }
}

export async function showD4ExamNativeNotification(
  title: string,
  body: string,
  _link?: string | null,
): Promise<boolean> {
  if (!isNativeShell()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== "granted") return false;

    await ensureChannel();
    idSeq = (idSeq + 1) % 100000000;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: idSeq,
          title: title || "D4EXAM",
          body: body || "",
          channelId: "d4exam_default",
          smallIcon: "ic_stat_d4exam",
          largeIcon: "ic_launcher",
          iconColor: "#0b1b3a",
          sound: "default",
        },
      ],
    });
    return true;
  } catch (e) {
    console.warn("[D4EXAM] local notification failed", e);
    return false;
  }
}
