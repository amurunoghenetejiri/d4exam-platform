/**
 * Android status bar theming for Capacitor.
 * Uses D4EXAM navy (#0b1b3a) to match the app shell sidebar.
 * During CBT exams, enterExamImmersive() hides the status bar for a fuller screen.
 */
import { isNativeShell } from "@/native/platform";

export const D4EXAM_STATUS_BAR = "#0b1b3a";

export async function applyNativeStatusBar(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: D4EXAM_STATUS_BAR });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.show();
  } catch (e) {
    console.warn("[D4EXAM] StatusBar plugin unavailable", e);
  }
}

/** Hide system status bar during a locked CBT session (best-effort immersive). */
export async function enterExamImmersive(): Promise<void> {
  if (!isNativeShell()) return;
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
}

/** Restore normal status bar after exam ends or is left. */
export async function exitExamImmersive(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
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
