/**
 * Notifications facade — FCM web push today; @capacitor/push-notifications later.
 * Device registration lives in src/lib/push.ts (unchanged).
 */
import {
  enablePushNotifications,
  getPushPermissionState,
  type PushPermissionState,
} from "@/lib/push";

export type { PushPermissionState };

export function getNotificationPermission(): PushPermissionState {
  return getPushPermissionState();
}

export async function requestNotificationPermission(
  userId: string,
  role?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  return enablePushNotifications(userId, role);
}
