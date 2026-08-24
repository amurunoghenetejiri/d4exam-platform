/**
 * Helpers for online-only actions (CBT start, approvals, password change, etc.).
 * Never pretend a server mutation succeeded offline.
 */

import { isOnlineNow, requireOnlineMessage } from "@/lib/offline-sync";
import { probeConnectivity } from "@/native/networkService";

export { requireOnlineMessage };

export async function assertOnline(featureHint?: string): Promise<void> {
  const ok = isOnlineNow() && (await probeConnectivity(3500));
  if (!ok) {
    throw new Error(
      featureHint
        ? `${featureHint} Internet connection required.`
        : requireOnlineMessage(),
    );
  }
}

/** Soft check for UI buttons — returns message or null. */
export function offlineBlockMessage(): string | null {
  if (isOnlineNow()) return null;
  return requireOnlineMessage();
}
