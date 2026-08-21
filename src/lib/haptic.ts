/**
 * CBT exam vibration (motor only — no sound).
 * Android Chrome supports navigator.vibrate after a user gesture.
 * iOS Safari has no Vibration API (calls are no-ops).
 *
 * none (no face)        → medium pulse
 * multi                 → strong
 * officer_warning       → longest / strongest
 * start                 → on Start Exam only
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

const PATTERNS: Record<HapticKind, number[]> = {
  start: [200, 80, 220],
  none: [120, 70, 140, 70, 160],
  unclear: [90, 70, 100, 70, 120],
  light: [70, 80, 85],
  multi: [150, 60, 180, 60, 200, 70, 220, 70, 250],
  strong: [150, 60, 180, 60, 200, 70, 220, 70, 250],
  camera_blocked: [140, 55, 170, 55, 190, 60, 220, 60, 240],
  tab_switch: [90, 50, 120],
  officer_warning: [
    220, 40, 260, 40, 300, 45, 340, 45, 380, 50, 420, 50, 460, 55, 500, 55, 550,
  ],
};

let primed = false;
let timers: number[] = [];
let keepAliveTimer: number | null = null;
let lastKind: HapticKind | null = null;
let lastAt = 0;

export function canVibrate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    const win = window as Window & { navigator?: Navigator; vibrate?: (p: number | number[]) => boolean };
    return typeof nav?.vibrate === "function" || typeof win?.vibrate === "function";
  } catch {
    return false;
  }
}

function clearTimers() {
  for (const id of timers) {
    try {
      window.clearTimeout(id);
    } catch {
      /* ignore */
    }
  }
  timers = [];
}

function vibrateRaw(arg: number | number[]): boolean {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    const win = window as Window & { vibrate?: (p: number | number[]) => boolean };
    const fn =
      (typeof nav?.vibrate === "function" ? nav.vibrate.bind(nav) : null) ||
      (typeof win?.vibrate === "function" ? win.vibrate.bind(win) : null);
    if (!fn) return false;
    return Boolean(fn(arg));
  } catch {
    return false;
  }
}

/** Pulse train fallback when array patterns are ignored. */
function pulseTrain(ons: number[], gap = 50) {
  let delay = 0;
  for (const pulse of ons) {
    const id = window.setTimeout(() => {
      vibrateRaw(pulse);
    }, delay);
    timers.push(id);
    delay += pulse + gap;
  }
}

function extractOns(pattern: number[]): number[] {
  const ons: number[] = [];
  for (let i = 0; i < pattern.length; i += 2) {
    if (typeof pattern[i] === "number") ons.push(pattern[i]);
  }
  return ons;
}

/** Unlock from Start Exam (must be user gesture). */
export function primeHaptics() {
  primed = true;
  clearTimers();
  vibrateRaw(1);
  const pattern = PATTERNS.start;
  const id0 = window.setTimeout(() => {
    if (!vibrateRaw(pattern)) pulseTrain(extractOns(pattern), 50);
  }, 10);
  timers.push(id0);
  timers.push(
    window.setTimeout(() => vibrateRaw(pattern), 80),
    window.setTimeout(() => pulseTrain([120, 150, 180], 50), 20),
  );
  startHapticKeepAlive();
}

/** Tiny pulse to keep activation chain alive on Android WebViews. */
export function refreshHapticUnlock() {
  primed = true;
  if (!canVibrate()) return;
  try {
    vibrateRaw(1);
  } catch {
    /* ignore */
  }
}

/** While exam is running, gently keep vibrate permission warm. */
export function startHapticKeepAlive() {
  if (typeof window === "undefined") return;
  stopHapticKeepAlive();
  keepAliveTimer = window.setInterval(() => {
    if (!primed || !canVibrate()) return;
    try {
      vibrateRaw(1);
    } catch {
      /* ignore */
    }
  }, 8_000);
}

export function stopHapticKeepAlive() {
  if (keepAliveTimer != null) {
    try {
      window.clearInterval(keepAliveTimer);
    } catch {
      /* ignore */
    }
    keepAliveTimer = null;
  }
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;
  if (!canVibrate()) return;

  const now = Date.now();
  const isLight = kind === "none" || kind === "unclear" || kind === "light";
  if (isLight && lastKind === kind && now - lastAt < 1500) return;
  lastKind = kind;
  lastAt = now;
  primed = true;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  const ons = extractOns(pattern);
  clearTimers();

  vibrateRaw(pattern);
  timers.push(
    window.setTimeout(() => pulseTrain(ons, isLight ? 55 : 45), 30),
    window.setTimeout(() => vibrateRaw(pattern), 70),
    window.setTimeout(() => vibrateRaw(pattern), 200),
  );

  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(() => vibrateRaw([200, 50, 240, 50, 280, 60, 320]), 600),
      window.setTimeout(() => pulseTrain([200, 250, 300, 350], 55), 40),
      window.setTimeout(() => vibrateRaw([250, 60, 300, 60, 350]), 900),
    );
  }
}

/** Longest / loudest pulse for officer warnings. */
export function hapticOfficerWarning() {
  haptic("officer_warning");
}
