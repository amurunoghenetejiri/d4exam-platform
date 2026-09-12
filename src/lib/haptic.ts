/**
 * CBT exam vibration — reliable on Capacitor Android + browser.
 * Prefers native ExamImmersive (amplitude 255); falls back to navigator.vibrate.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeShell } from "@/native/platform";

export type HapticKind =
  | "start"
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning"
  | "officer_pause"
  | "officer_submit"
  | "light"
  | "strong";

const DURATION: Record<HapticKind, number> = {
  start: 300,
  none: 1500,
  unclear: 1500,
  light: 1500,
  tab_switch: 1500,
  multi: 2000,
  strong: 2000,
  camera_blocked: 2000,
  officer_pause: 2000,
  officer_submit: 2000,
  officer_warning: 2500,
};

type ExamImmersivePlugin = {
  vibrate: (opts: { pattern?: number[]; ms?: number }) => Promise<{ ok?: boolean; error?: string }>;
};

const ExamImmersive = registerPlugin<ExamImmersivePlugin>("ExamImmersive");

let primed = false;
let lastFireAt = 0;

function pulsePattern(totalMs: number): number[] {
  const out: number[] = [0];
  let left = Math.max(200, totalMs);
  const on = 180;
  const gap = 40;
  while (left > 0) {
    const slice = Math.min(on, left);
    out.push(slice);
    left -= slice;
    if (left > 0) {
      out.push(gap);
      left -= gap;
    }
  }
  return out;
}

function useNative(): boolean {
  try {
    if (isNativeShell()) return true;
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

async function nativeVibrate(ms: number, pattern: number[]): Promise<boolean> {
  try {
    const ret = await ExamImmersive.vibrate({ ms, pattern });
    if (ret && ret.ok === false) return false;
    return true;
  } catch {
    return false;
  }
}

function webVibrate(pattern: number[] | number): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
    try {
      navigator.vibrate(0);
    } catch {
      /* ignore */
    }
    return Boolean(navigator.vibrate(pattern));
  } catch {
    return false;
  }
}

async function vibrateHard(ms: number): Promise<void> {
  const duration = Math.max(80, Math.min(Math.floor(ms), 4000));
  const pulses = pulsePattern(duration);
  const solid: number[] = [0, duration];

  if (useNative()) {
    let ok = await nativeVibrate(duration, solid);
    if (!ok) ok = await nativeVibrate(duration, pulses);
    if (ok) {
      window.setTimeout(() => {
        void nativeVibrate(Math.min(duration, 1200), [0, Math.min(duration, 1200)]);
      }, 80);
      return;
    }
  }

  if (webVibrate(solid)) {
    window.setTimeout(() => webVibrate(pulses), 60);
    return;
  }
  webVibrate(pulses);
  window.setTimeout(() => webVibrate([0, Math.min(duration, 800)]), 100);
}

export function canVibrate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (useNative()) return true;
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  } catch {
    return false;
  }
}

export function primeHaptics() {
  primed = true;
  void vibrateHard(50);
}

export function refreshHapticUnlock() {
  primed = true;
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastFireAt < 120) return;
  lastFireAt = now;
  primed = true;
  const ms = DURATION[kind] ?? 1500;
  void vibrateHard(ms);
}

export function hapticExamStart() {
  haptic("start");
}
export function hapticOfficerWarning() {
  haptic("officer_warning");
}
export function hapticFaceNone() {
  haptic("none");
}
export function hapticFaceMulti() {
  haptic("multi");
}
export function hapticLightWarning() {
  haptic("none");
}
export function hapticStrongWarning() {
  haptic("multi");
}
export function isHapticPrimed() {
  return primed;
}
