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

/**
 * Patterns in ms (vibrate / pause / vibrate…).
 * Loudness hierarchy (longest / strongest first):
 *   officer_warning > multi ≈ camera_blocked > none > unclear > tab_switch
 */
const PATTERNS: Record<HapticKind, number | number[]> = {
  // No face — strong but shorter than officer warning
  none: [180, 70, 180, 70, 220],
  unclear: [100, 50, 100, 50, 120],
  // Multiple faces — louder than no-face
  multi: [240, 80, 240, 80, 280, 90, 280],
  camera_blocked: [200, 70, 200, 70, 240],
  tab_switch: [120, 50, 120],
  // Officer warning — longest and strongest
  officer_warning: [400, 120, 400, 120, 500, 150, 500, 150, 600],
};

export function haptic(kind: HapticKind) {
  if (!canVibrate()) return;
  try {
    // Cancel any ongoing pattern first so the new one is felt clearly
    navigator.vibrate(0);
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* permission / policy blocked */
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
