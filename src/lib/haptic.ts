/** Browser Vibration API helpers for CBT security feedback. */

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
  officer_warning: [
    450, 110, 450, 110, 500, 130, 500, 130, 550, 150, 550, 150, 600, 160, 650,
  ],
};

let audioCtx: AudioContext | null = null;
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

function ensureAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx || audioCtx.state === "closed") audioCtx = new AC();
    if (audioCtx.state === "suspended") void audioCtx.resume();
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
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.02);
  } catch {
    /* ignore */
  }
}

function playTone(kind: HapticKind) {
  if (kind === "officer_warning") {
    beep(900, 0.14, 0);
    beep(900, 0.14, 0.22);
    beep(700, 0.18, 0.45);
    beep(1000, 0.22, 0.75);
    beep(900, 0.28, 1.1);
    return;
  }
  if (kind === "multi" || kind === "camera_blocked") {
    beep(760, 0.11, 0);
    beep(760, 0.11, 0.18);
    return;
  }
  if (kind === "tab_switch") {
    beep(540, 0.08, 0);
    beep(540, 0.08, 0.12);
    return;
  }
  beep(660, 0.1, 0);
  beep(660, 0.1, 0.14);
}

/** Must run inside a user gesture (Start exam). Unlocks vibrate + audio. */
export function primeHaptics() {
  primed = true;
  navVibrate(50);
  window.setTimeout(() => {
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
  }, 60);
  const ctx = ensureAudio();
  if (ctx?.state === "suspended") void ctx.resume();
  try {
    beep(30, 0.015, 0);
  } catch {
    /* ignore */
  }
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  const pattern = PATTERNS[kind];
  // Fire immediately
  if (!navVibrate(pattern)) {
    window.setTimeout(() => navVibrate(pattern), 40);
  }
  // Extra pulses for officer warning length
  if (kind === "officer_warning") {
    window.setTimeout(() => navVibrate([500, 130, 550, 130, 600]), 2200);
    window.setTimeout(() => navVibrate([550, 150, 650]), 4200);
  }
  // Always play tone after unlock (works even when vibrate is ignored)
  if (primed || kind === "officer_warning" || !canVibrate()) {
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
