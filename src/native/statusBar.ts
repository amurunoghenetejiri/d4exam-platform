/**
 * Android status bar theming for Capacitor.
 * Normal: overlays WebView with navy so header sits compact under system icons.
 * CBT: enterExamImmersive() hides status (+ best-effort nav) for true exam fullscreen.
 */
import { isNativeShell } from "@/native/platform";

export const D4EXAM_STATUS_BAR = "#0b1b3a";

function setImmersiveCss(on: boolean) {
  if (typeof document === "undefined") return;
  try {
    document.documentElement.classList.toggle("d4-exam-immersive", on);
    document.body.classList.toggle("d4-exam-immersive", on);
  } catch {
    /* ignore */
  }
}

export async function applyNativeStatusBar(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Overlay so safe-area padding is our only inset — avoids double gap
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch {
      /* older plugin */
    }
    await StatusBar.setBackgroundColor({ color: D4EXAM_STATUS_BAR });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.show();
  } catch (e) {
    console.warn("[D4EXAM] StatusBar plugin unavailable", e);
  }
}

/** Hide system chrome during a locked CBT session. */
export async function enterExamImmersive(): Promise<void> {
  if (!isNativeShell()) return;
  setImmersiveCss(true);
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch {
      /* older plugin */
    }
    await StatusBar.hide();
  } catch (e) {
    console.warn("[D4EXAM] enterExamImmersive", e);
  }
  try {
    const el = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => void;
    };
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch {
    /* device may block — continue without crash */
  }
}

/** Restore normal status bar after exam ends or is left. */
export async function exitExamImmersive(): Promise<void> {
  if (!isNativeShell()) return;
  setImmersiveCss(false);
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.();
  } catch {
    /* ignore */
  }
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch {
      /* older plugin */
    }
    await StatusBar.setBackgroundColor({ color: D4EXAM_STATUS_BAR });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.show();
  } catch (e) {
    console.warn("[D4EXAM] exitExamImmersive", e);
  }
}

export async function hideSplashSafely(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* ignore */
  }
}
