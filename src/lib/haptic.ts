/**
 * CBT exam vibration (motor only — no sound).
 *
 * Android Chrome supports navigator.vibrate.
 * iOS Safari generally does not — calls are no-ops there.
 *
 * Intensity:
 *   light (none/unclear)  → short soft pulses
 *   multi / camera_blocked → strong repeated pulses
 *   officer_warning       → longest / strongest (multi-wave)
 */

export type HapticKind =
  | "start"
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning"
  | "light"
  | "strong";

/** [on, off, on, off, …] milliseconds */
const PATTERNS: Record<HapticKind, number[]> = {
  // Short buzz when student taps Start Exam
  start: [120, 50, 160],

  // Light warning — face not seen (soft, not aggressive)
  none: [40, 50, 45, 50, 50],
  unclear: [35, 45, 40, 45, 45],
  light: [40, 50, 45],

  // Multiple faces — strong / loud haptic
  multi: [100, 50, 120, 50, 140, 60, 160],
  strong: [100, 50, 120, 50, 140, 60, 160],
  camera_blocked: [90, 45, 110, 45, 130, 55, 150],

  tab_switch: [60, 40, 80],

  // Officer warning — longest and strongest
  officer_warning: [
    140, 60, 160, 60, 180, 70, 200, 80, 220, 90, 250, 100, 280,
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
    pulseTrain(extractOns(pattern), 60);
  }
  const id = window.setTimeout(() => {
    vibrateRaw(pattern);
  }, 100);
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
    if (!ok) pulseTrain(ons, 70);
  }, 70);
  timers.push(idFb);

  // Officer warning: extend the motor much longer (2–3 extra waves)
  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(() => vibrateRaw([180, 70, 200, 70, 240]), 900),
      window.setTimeout(() => vibrateRaw([200, 80, 240, 80, 280]), 2200),
      window.setTimeout(() => pulseTrain([180, 220, 260], 90), 80),
      window.setTimeout(() => vibrateRaw([220, 90, 280]), 4000),
    );
  }

  // Multi-face: sustained strong
  if (kind === "multi" || kind === "strong") {
    timers.push(
      window.setTimeout(() => vibrateRaw([120, 50, 140, 50, 160]), 900),
      window.setTimeout(() => pulseTrain([100, 130, 150], 80), 70),
    );
  }

  // No-face / light: short soft only (no long follow-up)
  if (kind === "none" || kind === "unclear" || kind === "light") {
    timers.push(window.setTimeout(() => pulseTrain([40, 45, 50], 55), 60));
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
