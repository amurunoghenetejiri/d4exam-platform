/**
 * Online-required action guards. Minimal UX — no full-page blockers.
 */
import { isOnlineNow, requireOnlineMessage } from "@/lib/offline-sync";
import { resolveConnectivity } from "@/lib/sync/connectivity";

export { requireOnlineMessage, isOnlineNow };

/** True if we believe the device can reach the network. */
export function canReachNetwork(): boolean {
  return isOnlineNow();
}

/**
 * Returns null if online, or the user-facing message if offline.
 * Use before exam start, submit, approvals, etc.
 */
export async function assertOnlineAction(): Promise<string | null> {
  if (!isOnlineNow()) return requireOnlineMessage();
  const { internet } = await resolveConnectivity();
  if (!internet) return requireOnlineMessage();
  return null;
}

export function assertOnlineActionSync(): string | null {
  if (!isOnlineNow()) return requireOnlineMessage();
  return null;
}

/** Features available offline after at least one successful online session. */
export const OFFLINE_SUPPORTED = [
  "app_shell_boot",
  "session_restore",
  "dashboard_lists",
  "exam_metadata",
  "courses_list",
  "school_identity",
  "notifications_read",
  "results_view",
  "materials_cached",
  "profile_display",
  "navigation_menus",
] as const;

/** Features that always need internet (integrity / auth). */
export const ONLINE_REQUIRED = [
  "exam_start",
  "exam_submit",
  "live_monitoring",
  "approvals",
  "admin_mutations",
  "push_delivery",
  "auth_login",
  "first_time_sync",
] as const;
