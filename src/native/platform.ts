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

const NATIVE_FLAG_KEY = "d4exam_native_shell_v1";

function persistNativeFlag() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NATIVE_FLAG_KEY, "1");
      document.documentElement.classList.add("d4-native", "d4-app-shell");
    }
  } catch {
    /* ignore */
  }
}

function readNativeFlag(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (window.localStorage.getItem(NATIVE_FLAG_KEY) === "1") return true;
    if (document.documentElement.classList.contains("d4-native")) return true;
    if (document.documentElement.classList.contains("d4-app-shell")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

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
    if (/; wv\)/i.test(ua) && /Android/i.test(ua)) {
      return "android";
    }
    if (/Capacitor/i.test(ua) && /Android/i.test(ua)) {
      return "android";
    }
    if (/Capacitor/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)) {
      return "ios";
    }
  } catch {
    /* ignore */
  }
  if (readNativeFlag()) {
    try {
      const ua = navigator.userAgent || "";
      if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    } catch {
      /* ignore */
    }
    return "android";
  }
  return "web";
}

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as CapWindow;
  try {
    if (w.Capacitor?.isNativePlatform?.()) {
      persistNativeFlag();
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (w.Capacitor && typeof w.Capacitor.getPlatform === "function") {
      const p = w.Capacitor.getPlatform();
      if (p === "android" || p === "ios") {
        persistNativeFlag();
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  // User-agent heuristics for Capacitor WebView loading remote URL
  try {
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua) && (/; wv\)/i.test(ua) || /Capacitor/i.test(ua))) {
      persistNativeFlag();
      return true;
    }
    if (/Capacitor/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)) {
      persistNativeFlag();
      return true;
    }
  } catch {
    /* ignore */
  }
  if (readNativeFlag()) return true;
  const p = getRuntimePlatform();
  return p === "ios" || p === "android";
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const mq =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches;
    const ios =
      "standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    return mq || ios;
  } catch {
    return false;
  }
}

/** True for native APK/iOS shell or installed PWA — use app chrome, hide marketing footer */
export function isAppLikeShell(): boolean {
  if (isNativeShell()) return true;
  if (isStandalonePwa()) return true;
  if (readNativeFlag()) return true;
  return false;
}
