/**
 * CBT exam vibration (motor only — no sound).
 *
 * Strength hierarchy (user request):
 *   1) no-face / tab / unclear  — medium-strong (~1s)
 *   2) multi-face / pause / terminate / auto-submit — stronger (~1.6s)
 *   3) officer warning — strongest / longest (~3s+ with repeats)
 *
 * On the native APK: ExamImmersive.vibrate (Android Vibrator / VibratorManager).
 * On web: navigator.vibrate.
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
  start: [0, 180, 60, 220],
  none: [0, 220, 80, 280, 80, 300],
  unclear: [0, 200, 70, 260, 70, 280],
  light: [0, 160, 60, 200],
  tab_switch: [0, 220, 80, 280, 80, 300],
  multi: [0, 280, 70, 320, 70, 360, 80, 400],
  strong: [0, 280, 70, 320, 70, 360, 80, 400],
  camera_blocked: [0, 260, 70, 300, 70, 340, 80, 380],
  officer_pause: [0, 280, 70, 320, 70, 360, 80, 400],
  officer_submit: [0, 280, 70, 320, 70, 360, 80, 400],
  officer_warning: [
    0, 320, 60, 360, 60, 400, 70, 440, 70, 480, 80, 520, 90, 560, 100, 600,
  ],
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

async function vibratePattern(pattern: number[]): Promise<boolean> {
  const p = pattern.length ? pattern : [0, 280];
  try {
    if (Capacitor.isNativePlatform()) {
      const ret = await ExamImmersive.vibrate({ pattern: p });
      if (ret && ret.ok === false) {
        // fall through
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
  vibrateFireAndForget([0, 12]);
  const pattern = PATTERNS.start;
  vibrateFireAndForget(pattern);
  const id = window.setTimeout(() => vibrateFireAndForget(pattern), 140);
  timers.push(id);
}

export function refreshHapticUnlock() {
  primed = true;
  vibrateFireAndForget([0, 16]);
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  clearTimers();
  vibrateFireAndForget(pattern);

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
      window.setTimeout(() => vibrateFireAndForget(pattern), 90),
      window.setTimeout(() => vibrateFireAndForget(pattern), 650),
    );
  }

  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(
        () => vibrateFireAndForget([0, 350, 70, 400, 70, 450, 80, 500]),
        900,
      ),
      window.setTimeout(
        () => vibrateFireAndForget([0, 400, 80, 480, 80, 560]),
        2000,
      ),
      window.setTimeout(
        () => vibrateFireAndForget([0, 450, 90, 550]),
        3200,
      ),
    );
  }

  if (kind === "officer_submit" || kind === "multi" || kind === "officer_pause") {
    timers.push(
      window.setTimeout(
        () => vibrateFireAndForget([0, 300, 70, 360, 80, 420]),
        750,
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
