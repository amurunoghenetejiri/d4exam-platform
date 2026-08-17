/** Browser Vibration API helpers for CBT security feedback. */

export function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

export type HapticKind =
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning";

/** Patterns in ms (vibrate / pause / vibrate…). Officer warning is longer & stronger. */
const PATTERNS: Record<HapticKind, number | number[]> = {
  none: [90, 40, 90],
  unclear: [70, 35, 70],
  multi: [160, 60, 160, 60, 160],
  camera_blocked: [220, 80, 220],
  tab_switch: [100, 50, 100],
  // Louder / longer for officer-sent warnings during exam
  officer_warning: [320, 100, 320, 100, 400, 120, 400],
};

export function haptic(kind: HapticKind) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* permission / policy blocked */
  }
}

export function hapticOfficerWarning() {
  haptic("officer_warning");
}
