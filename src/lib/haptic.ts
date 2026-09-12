/**
 * CBT vibration — ONE solid motor run (no stacked fires that cancel each other).
 * none/tab ~1.5s | multi ~2s | officer_warning ~2.5s @ max amplitude
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

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
  start: 350,
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
let inflight = false;

export function canVibrate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (Capacitor.isNativePlatform()) return true;
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  } catch {
    return false;
  }
}

async function vibrateOnce(ms: number): Promise<boolean> {
  const duration = Math.max(80, Math.min(ms, 4000));
  try {
    if (Capacitor.isNativePlatform()) {
      const ret = await ExamImmersive.vibrate({ ms: duration, pattern: [0, duration] });
      if (!(ret && ret.ok === false)) return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      return navigator.vibrate([0, duration]);
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function primeHaptics() {
  primed = true;
  void vibrateOnce(40);
}

export function refreshHapticUnlock() {
  primed = true;
}

/**
 * Fire immediately. Debounce only identical rapid repeats so dual callers
 * (Pip + session) don't cancel the motor mid-buzz.
 */
export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;
  const ms = DURATION[kind] ?? 1500;
  const now = Date.now();
  if (now - lastFireAt < 400 && inflight) return;
  lastFireAt = now;
  inflight = true;
  void vibrateOnce(ms).finally(() => {
    window.setTimeout(() => {
      inflight = false;
    }, Math.min(ms, 600));
  });
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
