/**
 * CBT exam vibration (motor only — no sound).
 *
 * Strength (user request):
 *   - no-face / unclear / tab: continuous hard ~1.5s
 *   - multi-face / camera blocked / pause / submit: continuous hard ~2s
 *   - officer warning: longest / hardest cascade
 *
 * Native APK: ExamImmersive.vibrate (Android Vibrator, amplitude 255).
 * Web: navigator.vibrate.
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
  // Exam start — firm double pulse
  start: [0, 200, 70, 280],

  // No-face / unclear / light / tab — continuous hard ~1.5s total on-time
  none: [0, 500, 40, 500, 40, 500],
  unclear: [0, 480, 40, 480, 40, 480],
  light: [0, 400, 50, 450],
  tab_switch: [0, 500, 40, 500, 40, 500],

  // Multi-face / strong / camera / officer pause-submit — continuous hard ~2s
  multi: [0, 650, 40, 650, 40, 650],
  strong: [0, 650, 40, 650, 40, 650],
  camera_blocked: [0, 600, 40, 600, 40, 600],
  officer_pause: [0, 650, 40, 650, 40, 650],
  officer_submit: [0, 700, 40, 700, 40, 700],

  // Officer warning — strongest / longest cascade
  officer_warning: [
    0, 400, 50, 450, 50, 500, 50, 550, 50, 600, 60, 650, 60, 700,
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

/** Prefer native ExamImmersive on APK; fall back to navigator.vibrate on web. */
async function vibratePattern(pattern: number[]): Promise<boolean> {
  const p = pattern.length ? pattern : [0, 200];
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
      return navigator.vibrate(p);
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

  // Repeat so OEM motors that drop the first call still fire hard
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

  // Extra continuous burst for no-face (~1.5s feel) and multi (~2s feel)
  if (kind === "none" || kind === "unclear" || kind === "tab_switch") {
    timers.push(
      window.setTimeout(() => vibrateFireAndForget([0, 1500]), 50),
    );
  }
  if (kind === "multi" || kind === "strong" || kind === "camera_blocked" || kind === "officer_pause") {
    timers.push(
      window.setTimeout(() => vibrateFireAndForget([0, 2000]), 50),
    );
  }

  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(
        () => vibrateFireAndForget([0, 400, 50, 500, 50, 600, 50, 700]),
        900,
      ),
      window.setTimeout(
        () => vibrateFireAndForget([0, 500, 60, 600, 60, 700]),
        2000,
      ),
      window.setTimeout(
        () => vibrateFireAndForget([0, 600, 70, 800]),
        3200,
      ),
    );
  }

  if (kind === "officer_submit") {
    timers.push(
      window.setTimeout(
        () => vibrateFireAndForget([0, 400, 50, 500, 50, 600]),
        800,
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
