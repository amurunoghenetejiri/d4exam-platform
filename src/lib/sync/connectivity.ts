/**
 * Reliable connectivity — does not trust navigator.onLine alone.
 * Wraps existing networkService probe.
 */
import {
  getNetworkStatus,
  probeConnectivity,
  subscribeNetworkStatus,
  type NetworkStatus,
} from "@/native/networkService";
import type { ConnectivityState } from "./types";

export async function resolveConnectivity(): Promise<{
  state: ConnectivityState;
  network: NetworkStatus;
  internet: boolean;
}> {
  const network = getNetworkStatus();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { state: "offline", network: { ...network, connected: false }, internet: false };
  }
  const internet = await probeConnectivity(4500);
  if (!internet) {
    const linked = typeof navigator !== "undefined" && navigator.onLine;
    return {
      state: linked ? "network_no_internet" : "offline",
      network: { ...network, connected: false },
      internet: false,
    };
  }
  return { state: "online", network: { ...network, connected: true }, internet: true };
}

export function subscribeConnectivity(
  cb: (info: { state: ConnectivityState; network: NetworkStatus }) => void,
): () => void {
  return subscribeNetworkStatus((network) => {
    const state: ConnectivityState = !network.connected
      ? typeof navigator !== "undefined" && navigator.onLine
        ? "network_no_internet"
        : "offline"
      : "online";
    cb({ state, network });
  });
}

export { getNetworkStatus, probeConnectivity };
