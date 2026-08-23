import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { subscribeNetworkStatus } from "@/native/networkService";

/** Thin top banner when the device is offline — does not change routes or data. */
export function NetworkBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    return subscribeNetworkStatus((s) => setOffline(!s.connected));
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-amber-600 px-3 py-1.5 text-center text-xs font-semibold text-white"
      style={{
        paddingTop: "max(0.35rem, env(safe-area-inset-top))",
      }}
      role="status"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>You are offline. Some actions may not work until connection returns.</span>
    </div>
  );
}
