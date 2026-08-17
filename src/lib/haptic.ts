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
 *   officer_warning >> multi ≈ camera_blocked > none > unclear > tab_switch
 */
const PATTERNS: Record<HapticKind, number | number[]> = {
  // Face not detected — medium pulse
  none: [200, 80, 200, 80, 250],
  unclear: [120, 60, 120, 60, 140],
  // Multiple faces — stronger than no-face
  multi: [260, 90, 260, 90, 300, 100, 300],
  camera_blocked: [220, 80, 220, 80, 260],
  tab_switch: [140, 60, 140],
  // Officer warning — longest and strongest (clearly above face alerts)
  officer_warning: [
    500, 120, 500, 120, 600, 150, 600, 150, 700, 180, 700, 180, 800,
  ],
};

export function haptic(kind: HapticKind) {
  if (!canVibrate()) return;
  try {
    // Cancel any ongoing pattern so the new one is felt clearly
    navigator.vibrate(0);
    const pattern = PATTERNS[kind];
    // Brief delay after cancel improves reliability on Android WebViews
    window.setTimeout(() => {
      try {
        navigator.vibrate(pattern);
      } catch {
        /* permission / policy blocked */
      }
    }, 40);
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
