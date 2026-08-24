import { useEffect } from "react";
import { subscribeNetworkStatus } from "@/native/networkService";

/**
 * Intentionally silent — student offline mode must never show a website-style
 * "You're offline" strip. Exam write still uses assertOnline separately.
 */
export function NetworkBanner() {
  useEffect(() => {
    return subscribeNetworkStatus(() => undefined);
  }, []);
  return null;
}
