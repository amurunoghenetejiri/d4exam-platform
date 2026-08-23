/**
 * Platform detection — web today, Capacitor later without rewriting screens.
 */
export type RuntimePlatform = "web" | "ios" | "android" | "unknown";

export function getRuntimePlatform(): RuntimePlatform {
  if (typeof window === "undefined") return "unknown";
  const w = window as Window & { Capacitor?: { getPlatform?: () => string } };
  const cap = w.Capacitor?.getPlatform?.();
  if (cap === "ios") return "ios";
  if (cap === "android") return "android";
  return "web";
}

export function isNativeShell(): boolean {
  const p = getRuntimePlatform();
  return p === "ios" || p === "android";
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

export function isAppLikeShell(): boolean {
  return isNativeShell() || isStandalonePwa();
}
