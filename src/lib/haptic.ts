/**
 * CBT exam vibration (motor only — no sound).
 * Hierarchy (weakest → strongest):
 *   start  <  unclear/none (amber)  <  multi  <  officer_warning
 *
 * Only these events may vibrate. Never vibrate on taps/swipes.
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
  // Weakest — Start Exam only
  start: [140, 60, 160],
  // Amber: face not seen / unclear — stronger than start
  none: [180, 50, 220, 50, 260, 55, 280],
  unclear: [180, 50, 220, 50, 260, 55, 280],
  light: [100, 50, 120],
  // Multiple faces — longer/harder than unclear
  multi: [200, 40, 240, 40, 280, 45, 320, 45, 360, 50, 400],
  strong: [200, 40, 240, 40, 280, 45, 320, 45, 360, 50, 400],
  camera_blocked: [160, 50, 200, 50, 240],
  tab_switch: [90, 50, 120],
  // Officer warning — strongest / longest
  officer_warning: [
    250, 35, 300, 35, 350, 40, 400, 40, 450, 45, 500, 45, 550, 50, 600, 50, 650,
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
    if (typeof nav?.vibrate === "function" || typeof win?.vibrate === "function") return true;
    // Capacitor Android WebView often exposes vibrate only after a user gesture;
    // still treat as available so integrity alerts attempt vibration.
    try {
      const Cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (Cap?.isNativePlatform?.()) return true;
    } catch {
      /* ignore */
    }
    return false;
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
    if (fn) {
      try {
        return Boolean(fn(arg));
      } catch {
        /* fall through */
      }
    }
    // Native shell fallback: short pattern via Android WebView chrome if exposed
    try {
      const Cap = (window as unknown as {
        Capacitor?: { Plugins?: { Haptics?: { impact?: (o: { style: string }) => Promise<void> } } };
      }).Capacitor;
      const impact = Cap?.Plugins?.Haptics?.impact;
      if (typeof impact === "function") {
        void impact({ style: "HEAVY" });
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  } catch {
    return false;
  }
}

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

/** Unlock + Start Exam vibration (must run from user gesture). */
export function primeHaptics() {
  primed = true;
  clearTimers();
  const pattern = PATTERNS.start;
  vibrateRaw(pattern);
  timers.push(
    window.setTimeout(() => {
      if (!vibrateRaw(pattern)) pulseTrain(extractOns(pattern), 45);
    }, 40),
  );
  startHapticKeepAlive();
}

/** Mark primed only — never vibrate (avoids buzz on every tap). */
export function refreshHapticUnlock() {
  primed = true;
}

/** Keep permission flag; no motor pulse (user does not want random buzz). */
export function startHapticKeepAlive() {
  if (typeof window === "undefined") return;
  stopHapticKeepAlive();
  keepAliveTimer = window.setInterval(() => {
    primed = true;
  }, 15_000);
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

  const allowed: HapticKind[] = [
    "start",
    "none",
    "unclear",
    "multi",
    "camera_blocked",
    "officer_warning",
    "tab_switch",
  ];
  if (!allowed.includes(kind)) return;

  const now = Date.now();
  const cooldown =
    kind === "officer_warning" ? 800 : kind === "multi" ? 1200 : kind === "start" ? 500 : 1600;
  if (lastKind === kind && now - lastAt < cooldown) return;
  lastKind = kind;
  lastAt = now;
  primed = true;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  const ons = extractOns(pattern);
  clearTimers();

  vibrateRaw(pattern);
  timers.push(
    window.setTimeout(() => pulseTrain(ons, kind === "start" ? 55 : 40), 25),
    window.setTimeout(() => vibrateRaw(pattern), 60),
  );

  if (kind === "multi") {
    timers.push(window.setTimeout(() => vibrateRaw([280, 40, 320, 40, 380]), 350));
  }

  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(() => vibrateRaw([300, 30, 350, 30, 400, 35, 450, 35, 500]), 200),
      window.setTimeout(() => pulseTrain([300, 350, 400, 450, 500, 550], 40), 30),
      window.setTimeout(() => vibrateRaw([350, 30, 400, 30, 500, 30, 600]), 700),
      window.setTimeout(() => vibrateRaw([400, 30, 500, 30, 600]), 1200),
    );
  }
}

export function hapticOfficerWarning() {
  haptic("officer_warning");
}
