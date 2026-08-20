/**
 * CBT exam vibration (motor only — no sound).
 *
 * Android Chrome: navigator.vibrate works after a user gesture.
 * iOS Safari: no Vibration API — calls are no-ops (expected).
 *
 * Levels:
 *   light (none / unclear)     → soft short pulses
 *   multi / camera_blocked     → strong repeated pulses
 *   officer_warning            → longest / strongest
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

/** [on, off, on, off, …] ms — keep on-pulses >= 50ms (many devices ignore shorter). */
const PATTERNS: Record<HapticKind, number[]> = {
  start: [150, 60, 180],

  // Light — face not seen / unclear
  none: [55, 70, 60, 70, 65],
  unclear: [50, 65, 55, 65, 60],
  light: [55, 70, 60],

  // Strong — multiple faces / camera blocked
  multi: [120, 55, 140, 55, 160, 60, 180, 60, 200],
  strong: [120, 55, 140, 55, 160, 60, 180, 60, 200],
  camera_blocked: [110, 50, 130, 50, 150, 55, 170, 55, 190],

  tab_switch: [80, 50, 100],

  // Officer warning — longest and strongest
  officer_warning: [
    160, 55, 180, 55, 200, 60, 220, 60, 240, 70, 260, 70, 280, 80, 300,
  ],
};

let primed = false;
let timers: number[] = [];
let lastKind: HapticKind | null = null;
let lastAt = 0;

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
    // Some WebViews return undefined instead of true — treat as success
    const result = navigator.vibrate(arg as VibratePattern);
    return result !== false;
  } catch {
    return false;
  }
}

/** Schedule single pulses with gaps (works when array patterns are ignored). */
function pulseTrain(ons: number[], gap: number) {
  let delay = 0;
  for (const ms of ons) {
    const d = delay;
    const pulse = Math.max(50, ms);
    const id = window.setTimeout(() => {
      vibrateRaw(pulse);
    }, d);
    timers.push(id);
    delay += pulse + gap;
  }
}

function extractOns(pattern: number[]): number[] {
  const ons: number[] = [];
  for (let i = 0; i < pattern.length; i += 2) {
    ons.push(Math.max(50, pattern[i]!));
  }
  return ons;
}

/**
 * Call from a user gesture (Start exam button / first touch).
 * Required to unlock vibration on strict Android browsers.
 */
export function primeHaptics() {
  primed = true;
  clearTimers();
  // Tiny unlock pulse then start pattern
  vibrateRaw(1);
  const pattern = PATTERNS.start;
  const id0 = window.setTimeout(() => {
    const ok = vibrateRaw(pattern);
    if (!ok) pulseTrain(extractOns(pattern), 55);
  }, 16);
  timers.push(id0);
  // Second attempt — some devices need a delayed call after gesture
  const id1 = window.setTimeout(() => {
    vibrateRaw(pattern);
  }, 120);
  timers.push(id1);
}

/** Keep unlock alive while the student interacts with the exam UI. */
export function refreshHapticUnlock() {
  primed = true;
  if (!canVibrate()) return;
  try {
    // Minimal non-zero pulse keeps the "user activation" chain alive on some WebViews
    navigator.vibrate(1);
    const id = window.setTimeout(() => {
      try {
        navigator.vibrate(0);
      } catch {
        /* ignore */
      }
    }, 18);
    timers.push(id);
  } catch {
    /* ignore */
  }
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;
  if (!canVibrate()) return;

  // Soft de-dupe: same light kind within 1.2s is skipped (avoids spam)
  const now = Date.now();
  const isLight = kind === "none" || kind === "unclear" || kind === "light";
  if (isLight && lastKind === kind && now - lastAt < 1200) return;
  lastKind = kind;
  lastAt = now;

  primed = true;
  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  const ons = extractOns(pattern);

  clearTimers();

  // Do NOT cancel with vibrate(0) immediately before — races on some Android devices.
  // Primary pattern
  let ok = vibrateRaw(pattern);

  // Always also schedule a pulse-train — more reliable on cheap Android WebViews
  const idPulse = window.setTimeout(() => {
    pulseTrain(ons, isLight ? 60 : 50);
  }, 40);
  timers.push(idPulse);

  // Retry full pattern once
  const idRetry = window.setTimeout(() => {
    vibrateRaw(pattern);
  }, 90);
  timers.push(idRetry);

  if (kind === "officer_warning") {
    // Extend motor ~5–6 seconds total
    timers.push(
      window.setTimeout(() => vibrateRaw([180, 60, 200, 60, 240, 70, 280]), 700),
      window.setTimeout(() => pulseTrain([180, 220, 260, 300], 70), 50),
      window.setTimeout(() => vibrateRaw([200, 70, 240, 70, 280, 80, 320]), 2000),
      window.setTimeout(() => vibrateRaw([220, 80, 280, 80, 320]), 3800),
      window.setTimeout(() => pulseTrain([200, 250, 300], 80), 4500),
    );
  }

  if (kind === "multi" || kind === "strong" || kind === "camera_blocked") {
    timers.push(
      window.setTimeout(() => vibrateRaw([130, 50, 150, 50, 180, 55, 200]), 600),
      window.setTimeout(() => pulseTrain([120, 150, 180], 55), 50),
      window.setTimeout(() => vibrateRaw([140, 55, 170, 55, 200]), 1600),
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
