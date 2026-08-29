/**
 * Network status — browser online/offline + real connectivity probe.
 * Does NOT treat a failed asset fetch (404) as offline when navigator is online.
 */

export type NetworkStatus = {
  connected: boolean;
  connectionType: "wifi" | "cellular" | "none" | "unknown";
};

let lastProbeOk = true;
let lastProbeAt = 0;

export function getNetworkStatus(): NetworkStatus {
  if (typeof navigator === "undefined") {
    return { connected: true, connectionType: "unknown" };
  }
  const online = navigator.onLine && lastProbeOk;
  const conn = (navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string };
  }).connection;
  let connectionType: NetworkStatus["connectionType"] = "unknown";
  if (!online) connectionType = "none";
  else if (conn?.type === "wifi" || conn?.effectiveType === "wifi") connectionType = "wifi";
  else if (conn?.effectiveType) connectionType = "cellular";
  return { connected: online, connectionType };
}

/**
 * Confirm real connectivity without poisoning online state on 404/HTML errors.
 */
export async function probeConnectivity(timeoutMs = 4000): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    lastProbeOk = false;
    lastProbeAt = Date.now();
    return false;
  }
  if (typeof window === "undefined") return true;

  const now = Date.now();
  if (now - lastProbeAt < 3000) return lastProbeOk;

  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
    const url = `${window.location.origin}/favicon.png?_ping=${now}`;
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
    });
    window.clearTimeout(t);
    // Any completed network response means the device has Internet.
    lastProbeOk = true;
    void res;
  } catch {
    lastProbeOk = typeof navigator !== "undefined" ? navigator.onLine : false;
  }
  lastProbeAt = Date.now();
  return lastProbeOk;
}

/** Force mark online (e.g. after successful API call). */
export function markNetworkReachable(): void {
  lastProbeOk = true;
  lastProbeAt = Date.now();
}

export function subscribeNetworkStatus(cb: (status: NetworkStatus) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const fire = () => cb(getNetworkStatus());
  const onOnline = () => {
    lastProbeOk = true;
    lastProbeAt = Date.now();
    void probeConnectivity().then(() => fire());
  };
  const onOffline = () => {
    lastProbeOk = false;
    lastProbeAt = Date.now();
    fire();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  fire();
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
