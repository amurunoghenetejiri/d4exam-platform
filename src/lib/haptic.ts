/** Browser Vibration API helpers for CBT security feedback. */

export type HapticKind =
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning";

/**
 * Pulse durations in ms (on-only). Gaps are applied between pulses in code.
 * Simpler than alternating vibrate/pause arrays — more reliable on Android WebViews.
 */
const PULSES: Record<HapticKind, number[]> = {
  none: [200, 200, 250],
  unclear: [120, 120],
  multi: [250, 250, 300],
  camera_blocked: [220, 220, 260],
  tab_switch: [150, 150],
  // Longer than face alerts
  officer_warning: [400, 400, 450, 450, 500, 500, 550],
};

const GAPS: Record<HapticKind, number> = {
  none: 100,
  unclear: 80,
  multi: 100,
  camera_blocked: 90,
  tab_switch: 80,
  officer_warning: 130,
};

let audioCtx: AudioContext | null = null;
let primed = false;
const pendingTimers: number[] = [];

export function canVibrate(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.vibrate === "function";
}

function clearPending() {
  for (const t of pendingTimers) window.clearTimeout(t);
  pendingTimers.length = 0;
}

function navVibrate(ms: number | number[]): boolean {
  if (!canVibrate()) return false;
  try {
    const result = navigator.vibrate(ms as never);
    return result !== false;
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
    gain.gain.exponentialRampToValueAtTime(0.15, t0 + 0.015);
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
    beep(520, 0.08, 0);
    return;
  }
  beep(640, 0.1, 0);
}

/**
 * Must be called from a user gesture (e.g. Start exam) so vibration + audio unlock.
 */
export function primeHaptics() {
  primed = true;
  // Unlock vibration on Android (must be in gesture stack)
  navVibrate(1);
  window.setTimeout(() => navVibrate(0), 20);
  // Unlock Web Audio
  const ctx = ensureAudio();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
}

function runPulseSequence(kind: HapticKind) {
  clearPending();
  const pulses = PULSES[kind];
  const gap = GAPS[kind];
  let delay = 0;
  for (const ms of pulses) {
    const d = delay;
    const t = window.setTimeout(() => {
      navVibrate(ms);
    }, d);
    pendingTimers.push(t);
    delay += ms + gap;
  }
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;

  // Prefer pulse sequence (works better than long alternating patterns)
  runPulseSequence(kind);

  // Also try a single alternating pattern as backup (some devices prefer this)
  const alt: number[] = [];
  for (const ms of PULSES[kind]) {
    alt.push(ms, GAPS[kind]);
  }
  window.setTimeout(() => {
    // Only if nothing is still buzzing from sequence on picky devices
    navVibrate(alt);
  }, 30);

  // Audio always for officer; for others when vibrate is missing OR after prime
  if (kind === "officer_warning" || !canVibrate()) {
    playTone(kind);
  } else if (primed) {
    // Soft tone even when vibrate exists — helps when vibrate is silently ignored
    if (kind === "multi" || kind === "camera_blocked" || kind === "none") {
      playTone(kind);
    }
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
