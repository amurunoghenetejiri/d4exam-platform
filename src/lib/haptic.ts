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
  | "officer_warning"
  | "officer_pause"
  | "officer_submit"
  | "light"
  | "strong";

/** [on, off, on, off, …] milliseconds */
const PATTERNS: Record<HapticKind, number[]> = {
  start: [120, 50, 160],
  none: [40, 50, 45, 50, 50],
  unclear: [35, 45, 40, 45, 45],
  light: [40, 50, 45],
  multi: [100, 50, 120, 50, 140, 60, 160],
  strong: [100, 50, 120, 50, 140, 60, 160],
  camera_blocked: [90, 45, 110, 45, 130, 55, 150],
  tab_switch: [60, 40, 80],
  officer_warning: [
    140, 60, 160, 60, 180, 70, 200, 80, 220, 90, 250, 100, 280,
  ],
  officer_pause: [100, 50, 120, 50, 160, 70, 180],
  officer_submit: [160, 60, 200, 70, 240, 80, 280, 90, 320],
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

function pulseTrain(ons: number[], gap = 60) {
  let delay = 0;
  for (const ms of ons) {
    const id = window.setTimeout(() => {
      vibrateRaw(ms);
    }, delay);
    timers.push(id);
    delay += ms + gap;
  }
}

function extractOns(pattern: number[]): number[] {
  const ons: number[] = [];
  for (let i = 0; i < pattern.length; i += 2) {
    ons.push(pattern[i]);
  }
  return ons.length ? ons : [40, 45, 50];
}

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

  let ok = vibrateRaw(pattern);

  const idRetry = window.setTimeout(() => {
    if (!ok) ok = vibrateRaw(pattern);
  }, 35);
  timers.push(idRetry);

  const idFb = window.setTimeout(() => {
    if (!ok) pulseTrain(ons, 70);
  }, 70);
  timers.push(idFb);

  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(() => vibrateRaw([180, 70, 200, 70, 240]), 900),
      window.setTimeout(() => vibrateRaw([200, 80, 240, 80, 280]), 2200),
      window.setTimeout(() => pulseTrain([180, 220, 260], 90), 80),
      window.setTimeout(() => vibrateRaw([220, 90, 280]), 4000),
    );
  }

  if (kind === "officer_submit") {
    timers.push(
      window.setTimeout(() => vibrateRaw([180, 70, 220, 80, 260]), 700),
      window.setTimeout(() => vibrateRaw([200, 80, 280]), 1800),
      window.setTimeout(() => pulseTrain([160, 200, 240], 85), 70),
    );
  }

  if (kind === "officer_pause") {
    timers.push(
      window.setTimeout(() => vibrateRaw([100, 50, 140, 50, 160]), 600),
      window.setTimeout(() => pulseTrain([100, 130], 70), 60),
    );
  }

  if (kind === "multi" || kind === "strong" || kind === "camera_blocked") {
    timers.push(
      window.setTimeout(() => vibrateRaw([120, 50, 140, 50, 160]), 900),
      window.setTimeout(() => pulseTrain([100, 130, 150], 80), 70),
    );
  }

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
