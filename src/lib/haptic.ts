/**
 * CBT exam vibration (motor only — no sound).
 *
 * Android Chrome supports navigator.vibrate.
 * iOS Safari generally does not — calls are no-ops there.
 *
 * Intensity order (shortest → longest):
 *   start < unclear < none < multi < camera_blocked < tab_switch < officer_warning
 */

export type HapticKind =
  | "start"
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning";

/** [on, off, on, off, …] milliseconds */
const PATTERNS: Record<HapticKind, number[]> = {
  // Short buzz when student taps Start Exam
  start: [180, 70, 220],

  // No face — long, repeated soft pulses
  none: [280, 100, 280, 100, 320, 100, 360, 100, 400],

  // Face unclear — medium
  unclear: [200, 80, 220, 80, 260],

  // Multiple faces — longer / stronger
  multi: [400, 100, 450, 100, 500, 120, 550, 120, 600],

  camera_blocked: [350, 90, 380, 90, 420, 100, 450],

  tab_switch: [280, 90, 300],

  // Officer warning — longest and strongest
  officer_warning: [
    600, 120, 650, 120, 700, 140, 750, 140, 800, 160, 850, 160, 900, 180, 950,
  ],
};

let primed = false;
let timers: number[] = [];

export function canVibrate(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    );
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

function vibrateRaw(arg: number | number[]): boolean {
  if (!canVibrate()) return false;
  try {
    const result = navigator.vibrate(arg);
    return result !== false;
  } catch {
    return false;
  }
}

/** Fire a list of single pulses with gaps (fallback when full patterns are ignored). */
function pulseTrain(ons: number[], gap: number) {
  let delay = 0;
  for (const ms of ons) {
    const d = delay;
    const id = window.setTimeout(() => {
      vibrateRaw(ms);
    }, d);
    timers.push(id);
    delay += ms + gap;
  }
}

function extractOns(pattern: number[]): number[] {
  const ons: number[] = [];
  for (let i = 0; i < pattern.length; i += 2) {
    ons.push(pattern[i]!);
  }
  return ons;
}

/**
 * Call from a user gesture (Start exam / touch).
 * Unlocks vibration on strict browsers and buzzes on start.
 */
export function primeHaptics() {
  primed = true;
  clearTimers();
  vibrateRaw(0);
  const pattern = PATTERNS.start;
  const ok = vibrateRaw(pattern);
  if (!ok) {
    pulseTrain(extractOns(pattern), 70);
  }
  // Second wave shortly after — helps when first call is dropped mid-gesture
  const id = window.setTimeout(() => {
    vibrateRaw(pattern);
  }, 120);
  timers.push(id);
}

/** Keep activation alive while the student taps the exam UI. */
export function refreshHapticUnlock() {
  primed = true;
  vibrateRaw(1);
  const id = window.setTimeout(() => vibrateRaw(0), 12);
  timers.push(id);
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  const ons = extractOns(pattern);

  clearTimers();
  vibrateRaw(0);

  // Primary full pattern
  let ok = vibrateRaw(pattern);

  // Immediate retry (some Android WebViews need a second call)
  const idRetry = window.setTimeout(() => {
    if (!ok) ok = vibrateRaw(pattern);
  }, 35);
  timers.push(idRetry);

  // Fallback pulse train
  const idFb = window.setTimeout(() => {
    if (!ok) pulseTrain(ons, 90);
  }, 70);
  timers.push(idFb);

  // Officer warning: extend the motor much longer
  if (kind === "officer_warning") {
    // Extra waves so it is clearly the longest / strongest
    timers.push(
      window.setTimeout(() => vibrateRaw([700, 140, 800, 140, 900]), 2200),
      window.setTimeout(() => vibrateRaw([750, 150, 850, 150, 950]), 4500),
      window.setTimeout(() => pulseTrain([700, 800, 900, 950], 130), 90),
      window.setTimeout(() => vibrateRaw([800, 160, 900]), 7000),
    );
  }

  // Multi-face: a bit more sustained than no-face
  if (kind === "multi") {
    timers.push(
      window.setTimeout(() => vibrateRaw([450, 100, 500, 100, 550]), 1800),
      window.setTimeout(() => pulseTrain([400, 500, 550], 100), 80),
    );
  }

  // No-face: long soft train
  if (kind === "none") {
    timers.push(
      window.setTimeout(() => pulseTrain([280, 320, 360, 400], 100), 80),
      window.setTimeout(() => vibrateRaw([300, 100, 350, 100, 400]), 2000),
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

export function isHapticPrimed() {
  return primed;
}
