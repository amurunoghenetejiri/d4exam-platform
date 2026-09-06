/**
 * Platform detection — web today, Capacitor Android/iOS shell for native APK.
 * Must detect native even when server.url loads the remote Vercel site.
 */
export type RuntimePlatform = "web" | "ios" | "android" | "unknown";

type CapWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
    isPluginAvailable?: (name: string) => boolean;
  };
};

export function getRuntimePlatform(): RuntimePlatform {
  if (typeof window === "undefined") return "unknown";
  const w = window as CapWindow;
  const cap = w.Capacitor;
  if (cap) {
    try {
      if (typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
        const p = cap.getPlatform?.() || "android";
        if (p === "ios") return "ios";
        return "android";
      }
    } catch {
      /* ignore */
    }
    const p = cap.getPlatform?.();
    if (p === "ios") return "ios";
    if (p === "android") return "android";
  }
  // Heuristic: Capacitor Android WebView user agent
  try {
    const ua = navigator.userAgent || "";
    if (/; wv\)/i.test(ua) && /Android/i.test(ua) && /Capacitor/i.test(ua)) {
      return "android";
    }
  } catch {
    /* ignore */
  }
  return "web";
}

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as CapWindow;
  try {
    if (w.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    /* ignore */
  }
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
