/** CBT security vibration only — no sound. */

export type HapticKind =
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning"
  | "start";

/**
 * Standard alternating pattern: [vibrateMs, pauseMs, vibrateMs, …]
 * Keep individual on-segments under 1000ms for better Android support.
 */
const PATTERNS: Record<HapticKind, number[]> = {
  // Exam start — clear short confirmation buzz
  start: [120, 60, 180],
  // Face not detected
  none: [300, 100, 300, 100, 400],
  unclear: [180, 80, 180, 80, 220],
  multi: [350, 100, 350, 100, 400, 100, 400],
  camera_blocked: [300, 90, 300, 90, 350],
  tab_switch: [220, 80, 220],
  // Officer — longest and strongest
  officer_warning: [
    500, 120, 500, 120, 550, 140, 550, 140, 600, 160, 600, 160, 700, 180, 700,
  ],
};

let primed = false;
const pending: number[] = [];

export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function clearPending() {
  for (const id of pending) window.clearTimeout(id);
  pending.length = 0;
}

function navVibrate(pattern: number | number[]): boolean {
  if (!canVibrate()) return false;
  try {
    // Chrome returns false when the call is ignored
    return navigator.vibrate(pattern as never) !== false;
  } catch {
    return false;
  }
}

/**
 * Some Android WebViews ignore long patterns but accept repeated single pulses.
 */
function runSequentialPulses(pulses: number[], gapMs: number) {
  clearPending();
  let delay = 0;
  for (const ms of pulses) {
    const d = delay;
    const id = window.setTimeout(() => {
      navVibrate(ms);
    }, d);
    pending.push(id);
    delay += ms + gapMs;
  }
}

/**
 * Must be called from a real user gesture (Start exam button).
 * Unlocks Vibration API and gives a clear start buzz.
 */
export function primeHaptics() {
  primed = true;
  // Noticeable start vibration (user asked to feel it when exam starts)
  const ok = navVibrate(PATTERNS.start);
  if (!ok) {
    // Fallback: sequential singles
    runSequentialPulses([120, 180], 60);
  }
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;

  // 1) Full pattern in one call (best on Chrome Android)
  const ok = navVibrate(pattern);

  // 2) Retry shortly if ignored
  if (!ok) {
    const id = window.setTimeout(() => navVibrate(pattern), 50);
    pending.push(id);
  }

  // 3) Sequential single-pulse fallback (picky WebViews)
  const onOnly: number[] = [];
  for (let i = 0; i < pattern.length; i += 2) {
    onOnly.push(pattern[i]);
  }
  if (!ok) {
    runSequentialPulses(onOnly, 100);
  }

  // 4) Officer warning: keep pulsing longer
  if (kind === "officer_warning") {
    const id1 = window.setTimeout(() => navVibrate([500, 120, 550, 120, 600]), 2500);
    const id2 = window.setTimeout(() => navVibrate([550, 140, 650, 140, 700]), 5000);
    const id3 = window.setTimeout(() => runSequentialPulses([500, 550, 600, 650], 120), 100);
    pending.push(id1, id2, id3);
  }
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

export function hapticExamStart() {
  haptic("start");
}

export function isHapticPrimed() {
  return primed;
}
