/**
 * CBT exam vibration (motor only — no sound).
 *
 * User request (hard + long):
 *   - no-face / unclear / tab: continuous hard ~1.5s, high pulse rate
 *   - multi-face / camera / pause / submit / officer warning: continuous hard ~2s+
 *
 * Native APK: ExamImmersive.vibrate (Android amplitude 255).
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

/**
 * High-frequency hard patterns (short off gaps = feels stronger / higher Hz).
 * navigator.vibrate / Android waveform: [delay, on, delay, on, …] ms
 */
function burst(totalOnMs: number, pulseMs = 80, gapMs = 25): number[] {
  const out: number[] = [0];
  let remaining = Math.max(200, totalOnMs);
  while (remaining > 0) {
    const on = Math.min(pulseMs, remaining);
    out.push(on);
    remaining -= on;
    if (remaining > 0) {
      out.push(gapMs);
    }
  }
  return out;
}

const PATTERNS: Record<HapticKind, number[]> = {
  start: [0, 220, 50, 320],

  // ~1.5s continuous hard, high frequency
  none: burst(1500, 90, 20),
  unclear: burst(1500, 90, 20),
  light: burst(1500, 90, 20),
  tab_switch: burst(1500, 90, 20),

  // ~2s continuous hard, high frequency
  multi: burst(2000, 100, 18),
  strong: burst(2000, 100, 18),
  camera_blocked: burst(2000, 100, 18),
  officer_pause: burst(2000, 100, 18),
  officer_submit: burst(2000, 100, 18),

  // Officer warning — longest hard cascade (~2.5s+)
  officer_warning: burst(2500, 110, 15),
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
  const p = pattern.length ? pattern : [0, 200];
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
  vibrateFireAndForget([0, 20]);
  const pattern = PATTERNS.start;
  vibrateFireAndForget(pattern);
  const id = window.setTimeout(() => vibrateFireAndForget(pattern), 120);
  timers.push(id);
}

export function refreshHapticUnlock() {
  primed = true;
  vibrateFireAndForget([0, 20]);
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  clearTimers();
  vibrateFireAndForget(pattern);

  // Re-fire so OEM motors that drop the first call still hit hard
  const heavy =
    kind === "officer_warning" ||
    kind === "officer_submit" ||
    kind === "officer_pause" ||
    kind === "multi" ||
    kind === "strong" ||
    kind === "camera_blocked" ||
    kind === "tab_switch" ||
    kind === "none" ||
    kind === "unclear" ||
    kind === "light";

  if (heavy) {
    timers.push(
      window.setTimeout(() => vibrateFireAndForget(pattern), 60),
      window.setTimeout(() => vibrateFireAndForget(pattern), 400),
    );
  }

  // Continuous solid burst for guaranteed duration feel
  if (kind === "none" || kind === "unclear" || kind === "tab_switch" || kind === "light") {
    timers.push(window.setTimeout(() => vibrateFireAndForget([0, 1500]), 30));
  }
  if (
    kind === "multi" ||
    kind === "strong" ||
    kind === "camera_blocked" ||
    kind === "officer_pause" ||
    kind === "officer_submit"
  ) {
    timers.push(window.setTimeout(() => vibrateFireAndForget([0, 2000]), 30));
  }
  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(() => vibrateFireAndForget([0, 2000]), 30),
      window.setTimeout(() => vibrateFireAndForget(burst(2000, 110, 15)), 500),
      window.setTimeout(() => vibrateFireAndForget([0, 800]), 2100),
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
