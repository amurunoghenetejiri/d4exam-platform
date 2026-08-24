import { useEffect } from "react";
import { subscribeNetworkStatus } from "@/native/networkService";

/**
 * Student offline mode: no blocking "no internet" banner.
 * App stays usable from cache; exam write still requires online separately.
 */
export function NetworkBanner() {
  useEffect(() => {
    return subscribeNetworkStatus(() => undefined);
  }, []);
  return null;
}
