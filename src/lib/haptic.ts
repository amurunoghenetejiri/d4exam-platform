/** Browser Vibration API helpers for CBT security feedback. */

export type HapticKind =
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning";

/**
 * Alternating [vibrate, pause, vibrate, …] in ms.
 * Chrome Android handles this form most reliably.
 */
const PATTERNS: Record<HapticKind, number[]> = {
  none: [250, 100, 250, 100, 300],
  unclear: [150, 80, 150, 80, 180],
  multi: [300, 100, 300, 100, 350, 100, 350],
  camera_blocked: [260, 90, 260, 90, 300],
  tab_switch: [180, 80, 180],
  // Longest — clearly stronger than face alerts
  officer_warning: [
    400, 120, 400, 120, 450, 140, 450, 140, 500, 160, 500, 160, 550, 180, 600,
  ],
};

let audioCtx: AudioContext | null = null;
let primed = false;

export function canVibrate(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.vibrate === "function";
}

function navVibrate(pattern: number | number[]): boolean {
  if (!canVibrate()) return false;
  try {
    const ok = navigator.vibrate(pattern as never);
    return ok !== false;
  } catch {
    return false;
  }
}

function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function beep(freq: number, durationSec: number, when = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + when;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.03);
  } catch {
    /* ignore */
  }
}

function playTone(kind: HapticKind) {
  if (kind === "officer_warning") {
    beep(880, 0.16, 0);
    beep(880, 0.16, 0.28);
    beep(660, 0.2, 0.55);
    beep(990, 0.25, 0.9);
    beep(880, 0.32, 1.25);
    return;
  }
  if (kind === "multi" || kind === "camera_blocked") {
    beep(740, 0.12, 0);
    beep(740, 0.12, 0.2);
    return;
  }
  if (kind === "tab_switch") {
    beep(520, 0.09, 0);
    beep(520, 0.09, 0.14);
    return;
  }
  // none / unclear
  beep(640, 0.11, 0);
  beep(640, 0.11, 0.16);
}

/**
 * Call from a real user gesture (Start exam button) to unlock vibration + audio.
 * Without this, many browsers silently ignore later vibrate()/AudioContext calls.
 */
export function primeHaptics() {
  primed = true;
  // Short buzz in the same gesture stack — unlocks Vibration API on Android
  navVibrate(40);
  window.setTimeout(() => {
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
  }, 50);
  const ctx = ensureAudio();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
  // Tiny silent-ish beep to fully unlock audio graph
  try {
    beep(40, 0.02, 0);
  } catch {
    /* ignore */
  }
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind];

  // Primary: full pattern in one call (best Chrome Android support)
  const ok = navVibrate(pattern);

  // Retry once if the first call was ignored
  if (!ok) {
    window.setTimeout(() => navVibrate(pattern), 60);
  }

  // Officer warning: re-fire mid-way so the pulse feels longer on devices that clamp
  if (kind === "officer_warning") {
    window.setTimeout(() => navVibrate([450, 140, 500, 140, 550]), 2000);
    window.setTimeout(() => navVibrate([500, 160, 600]), 4000);
  }

  // Tones: always for officer; for face/tab after prime or when vibrate missing
  if (kind === "officer_warning") {
    playTone(kind);
  } else if (!canVibrate() || primed) {
    playTone(kind);
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
