/**
 * CBT exam vibration (motor only — no sound).
 *
 * Android Chrome supports navigator.vibrate.
 * iOS Safari generally does not — calls are no-ops there.
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
  start: [200, 80, 250],
  none: [350, 120, 350, 120, 450],
  unclear: [200, 90, 200, 90, 250],
  multi: [400, 120, 400, 120, 450, 120, 500],
  camera_blocked: [350, 100, 350, 100, 400],
  tab_switch: [250, 90, 250],
  // Longest — officer warning
  officer_warning: [
    500, 150, 500, 150, 600, 150, 600, 150, 700, 200, 700, 200, 800,
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
    // Spec: returns false if the user agent ignored the call
    const result = navigator.vibrate(arg);
    return result !== false;
  } catch {
    return false;
  }
}

/** Fire a list of single pulses with gaps (fallback when patterns are ignored). */
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

/**
 * Call from a user gesture (Start exam / touch).
 * Unlocks vibration on strict browsers and buzzes on start.
 */
export function primeHaptics() {
  primed = true;
  // Cancel anything leftover, then start pattern
  vibrateRaw(0);
  const ok = vibrateRaw(PATTERNS.start);
  if (!ok) {
    pulseTrain([200, 250], 80);
  }
}

/** Keep activation alive while the student taps the exam UI. */
export function refreshHapticUnlock() {
  primed = true;
  // Tiny no-op-ish pulse to refresh some WebView gesture chains
  vibrateRaw(1);
  const id = window.setTimeout(() => vibrateRaw(0), 15);
  timers.push(id);
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;

  // Cancel previous pattern so the new one is felt clearly
  vibrateRaw(0);

  // Primary: full pattern
  let ok = vibrateRaw(pattern);

  // Immediate retry (some devices need a second call)
  if (!ok) {
    const id = window.setTimeout(() => {
      ok = vibrateRaw(pattern);
    }, 40);
    timers.push(id);
  }

  // Fallback: only the "on" segments as single pulses
  const ons: number[] = [];
  for (let i = 0; i < pattern.length; i += 2) {
    ons.push(pattern[i]!);
  }
  const idFb = window.setTimeout(() => {
    // If still nothing felt / first call was ignored, use pulse train
    if (!ok) pulseTrain(ons, 100);
  }, 80);
  timers.push(idFb);

  // Officer warning: keep motor going longer
  if (kind === "officer_warning") {
    clearTimers();
    // Restart clean for the long warning
    vibrateRaw(0);
    vibrateRaw(pattern);
    pulseTrain(ons, 120);
    timers.push(
      window.setTimeout(() => vibrateRaw([600, 150, 700, 150, 800]), 2800),
      window.setTimeout(() => vibrateRaw([700, 200, 800]), 5500),
      window.setTimeout(() => pulseTrain([600, 700, 800], 150), 100),
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
