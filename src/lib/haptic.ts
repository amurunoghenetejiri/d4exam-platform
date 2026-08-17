/** Browser Vibration API helpers for CBT security feedback. */

export function canVibrate(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.vibrate === "function";
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
 * officer_warning is intentionally the longest / strongest.
 * Keep individual pulses under ~1s — some Android builds clamp longer ones.
 */
const PATTERNS: Record<HapticKind, number[]> = {
  none: [220, 90, 220, 90, 280],
  unclear: [140, 70, 140, 70, 160],
  multi: [280, 90, 280, 90, 320, 100, 320],
  camera_blocked: [240, 80, 240, 80, 280],
  tab_switch: [160, 70, 160],
  // ~6–7s of strong pulses — clearly above face alerts
  officer_warning: [
    450, 100, 450, 100, 500, 120, 500, 120, 550, 140, 550, 140, 600, 160, 600,
  ],
};

function tryVibrate(pattern: number | number[]): boolean {
  if (!canVibrate()) return false;
  try {
    // Some WebViews ignore patterns until a prior cancel
    navigator.vibrate(0);
  } catch {
    /* ignore */
  }
  try {
    const ok = navigator.vibrate(pattern);
    // Spec: returns false if the call was ignored
    return ok !== false;
  } catch {
    return false;
  }
}

/** Short audible cue when vibration API is missing/ignored (e.g. many iOS browsers). */
function playAlertTone(kind: HapticKind) {
  if (typeof window === "undefined") return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const pulses =
      kind === "officer_warning"
        ? [
            { t: 0, f: 880, d: 0.18 },
            { t: 0.28, f: 880, d: 0.18 },
            { t: 0.56, f: 660, d: 0.22 },
            { t: 0.9, f: 990, d: 0.28 },
            { t: 1.3, f: 880, d: 0.35 },
          ]
        : kind === "multi" || kind === "camera_blocked"
          ? [
              { t: 0, f: 720, d: 0.12 },
              { t: 0.2, f: 720, d: 0.12 },
            ]
          : [{ t: 0, f: 640, d: 0.1 }];

    for (const p of pulses) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = p.f;
      gain.gain.setValueAtTime(0.0001, now + p.t);
      gain.gain.exponentialRampToValueAtTime(0.12, now + p.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p.t + p.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + p.t);
      osc.stop(now + p.t + p.d + 0.02);
    }
    window.setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
    }, 2500);
  } catch {
    /* autoplay / policy */
  }
}

export function haptic(kind: HapticKind) {
  const pattern = PATTERNS[kind];
  let started = tryVibrate(pattern);

  // Retry once shortly after — cancel+pattern is flaky on some Androids
  if (!started) {
    window.setTimeout(() => {
      tryVibrate(pattern);
    }, 50);
  } else {
    // Re-assert mid-pattern for officer warning so the device keeps pulsing
    if (kind === "officer_warning") {
      window.setTimeout(() => tryVibrate([500, 120, 500, 120, 600]), 1800);
      window.setTimeout(() => tryVibrate([550, 140, 600, 140, 650]), 3600);
    }
  }

  // Always reinforce officer warning with tone; face alerts only if vibrate unavailable
  if (kind === "officer_warning" || !canVibrate()) {
    playAlertTone(kind);
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
