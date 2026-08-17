/** Browser Vibration API helpers for CBT security feedback. Vibration only — no sound. */

export type HapticKind =
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning";

/** Alternating [on, off, on, …] ms — Chrome Android standard form */
const PATTERNS: Record<HapticKind, number[]> = {
  none: [280, 90, 280, 90, 320],
  unclear: [160, 70, 160, 70, 200],
  multi: [320, 90, 320, 90, 360, 90, 360],
  camera_blocked: [280, 80, 280, 80, 320],
  tab_switch: [200, 70, 200],
  // Longest / strongest — clearly above face alerts
  officer_warning: [
    450, 110, 450, 110, 500, 130, 500, 130, 550, 150, 550, 150, 600, 160, 650,
  ],
};

let primed = false;

export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function navVibrate(pattern: number | number[]): boolean {
  if (!canVibrate()) return false;
  try {
    return navigator.vibrate(pattern as never) !== false;
  } catch {
    return false;
  }
}

/**
 * Call from a user gesture (Start exam) to unlock the Vibration API on Android.
 * No sound — vibration only.
 */
export function primeHaptics() {
  primed = true;
  // Silent unlock pulse (very short, not meant as feedback)
  navVibrate(1);
  window.setTimeout(() => {
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
  }, 20);
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind];

  // Primary pattern
  if (!navVibrate(pattern)) {
    window.setTimeout(() => navVibrate(pattern), 40);
  }

  // Officer warning: extra waves so it stays longer / stronger
  if (kind === "officer_warning") {
    window.setTimeout(() => navVibrate([500, 130, 550, 130, 600]), 2200);
    window.setTimeout(() => navVibrate([550, 150, 650]), 4200);
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
