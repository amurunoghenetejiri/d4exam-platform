/**
 * Notifications facade — web FCM or Capacitor Push Notifications on Android.
 */
import {
  enablePushNotifications,
  getPushPermissionState,
  refreshNativePushPermissionState,
  initNativePushIfNeeded,
  type PushPermissionState,
} from "@/lib/push";
import { isNativeShell } from "@/native/platform";

export type { PushPermissionState };

export function getNotificationPermission(): PushPermissionState {
  return getPushPermissionState();
}

export async function getNotificationPermissionAsync(): Promise<PushPermissionState> {
  if (isNativeShell()) return refreshNativePushPermissionState();
  return getPushPermissionState();
}

export async function requestNotificationPermission(
  userId: string,
  role?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  return enablePushNotifications(userId, role);
}

export { initNativePushIfNeeded };
