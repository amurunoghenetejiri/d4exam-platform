import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { subscribeNetworkStatus } from "@/native/networkService";

/** Thin top banner when the device is offline — does not block UI. */
export function NetworkBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    return subscribeNetworkStatus((online) => setOffline(!online));
  }, []);

  if (!offline) return null;

  return (
    <div
      data-network-banner
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-amber-950"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>You are offline. Some features need a connection.</span>
    </div>
  );
}
