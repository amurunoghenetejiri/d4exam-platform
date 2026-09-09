/**
 * CBT exam vibration (motor only — no sound).
 *
 * On the native APK: uses ExamImmersive.vibrate (Android Vibrator / VibratorManager).
 * On web: navigator.vibrate. iOS Safari is generally a no-op.
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

/** [delay, on, delay, on, …] ms — same shape as navigator.vibrate */
const PATTERNS: Record<HapticKind, number[]> = {
  start: [0, 120, 50, 160],
  none: [0, 40, 50, 45, 50, 50],
  unclear: [0, 35, 45, 40, 45, 45],
  light: [0, 40, 50, 45],
  multi: [0, 100, 50, 120, 50, 140, 60, 160],
  strong: [0, 100, 50, 120, 50, 140, 60, 160],
  camera_blocked: [0, 90, 45, 110, 45, 130, 55, 150],
  tab_switch: [0, 60, 40, 80],
  officer_warning: [
    0, 140, 60, 160, 60, 180, 70, 200, 80, 220, 90, 250, 100, 280,
  ],
  officer_pause: [0, 100, 50, 120, 50, 160, 70, 180],
  officer_submit: [0, 160, 60, 200, 70, 240, 80, 280, 90, 320],
};

type ExamImmersivePlugin = {
  vibrate: (opts: { pattern?: number[]; ms?: number }) => Promise<{ ok?: boolean; error?: string }>;
  enter?: () => Promise<void>;
  exit?: () => Promise<void>;
};

const ExamImmersive = registerPlugin<ExamImmersivePlugin>("ExamImmersive");

let primed = false;
let timers: number[] = [];

export function canVibrate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (Capacitor.isNativePlatform()) return true;
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  } catch {
    return false;
  }
}

function clearTimers() {
  for (const t of timers) {
    try {
      window.clearTimeout(t);
    } catch {
      /* ignore */
    }
  }
  timers = [];
}

/** Prefer native ExamImmersive on APK; fall back to navigator.vibrate on web. */
async function vibratePattern(pattern: number[]): Promise<boolean> {
  const p = pattern.length ? pattern : [0, 120];
  try {
    if (Capacitor.isNativePlatform()) {
      const ret = await ExamImmersive.vibrate({ pattern: p });
      if (ret && ret.ok === false) {
        // fall through to web vibrate inside WebView
      } else {
        return true;
      }
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      const result = navigator.vibrate(p);
      return result !== false;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function vibrateFireAndForget(pattern: number[]) {
  void vibratePattern(pattern);
}

export function primeHaptics() {
  primed = true;
  clearTimers();
  // Tiny tick unlocks some OEM motors, then full start pattern
  vibrateFireAndForget([0, 1]);
  const pattern = PATTERNS.start;
  vibrateFireAndForget(pattern);
  const id = window.setTimeout(() => vibrateFireAndForget(pattern), 120);
  timers.push(id);
}

export function refreshHapticUnlock() {
  primed = true;
  vibrateFireAndForget([0, 8]);
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  clearTimers();
  vibrateFireAndForget(pattern);

  // Stronger kinds: repeat so OEM motors that drop the first call still fire
  if (
    kind === "officer_warning" ||
    kind === "officer_submit" ||
    kind === "officer_pause" ||
    kind === "multi" ||
    kind === "strong" ||
    kind === "camera_blocked" ||
    kind === "tab_switch" ||
    kind === "none" ||
    kind === "unclear"
  ) {
    timers.push(
      window.setTimeout(() => vibrateFireAndForget(pattern), 80),
      window.setTimeout(() => vibrateFireAndForget(pattern), 700),
    );
  }

  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(
        () => vibrateFireAndForget([0, 180, 70, 200, 70, 240]),
        900,
      ),
      window.setTimeout(
        () => vibrateFireAndForget([0, 200, 80, 240, 80, 280]),
        2200,
      ),
    );
  }

  if (kind === "officer_submit") {
    timers.push(
      window.setTimeout(
        () => vibrateFireAndForget([0, 180, 70, 220, 80, 260]),
        700,
      ),
    );
  }
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
