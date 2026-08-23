/**
 * Network status — browser online/offline now; swap to @capacitor/network later.
 */
export type NetworkStatus = {
  connected: boolean;
  connectionType: "wifi" | "cellular" | "none" | "unknown";
};

export function getNetworkStatus(): NetworkStatus {
  if (typeof navigator === "undefined") {
    return { connected: true, connectionType: "unknown" };
  }
  const online = navigator.onLine;
  const conn = (navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string };
  }).connection;
  let connectionType: NetworkStatus["connectionType"] = "unknown";
  if (!online) connectionType = "none";
  else if (conn?.type === "wifi" || conn?.effectiveType === "wifi") connectionType = "wifi";
  else if (conn?.effectiveType) connectionType = "cellular";
  return { connected: online, connectionType };
}

export function subscribeNetworkStatus(cb: (status: NetworkStatus) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const fire = () => cb(getNetworkStatus());
  window.addEventListener("online", fire);
  window.addEventListener("offline", fire);
  fire();
  return () => {
    window.removeEventListener("online", fire);
    window.removeEventListener("offline", fire);
  };
}
