/**
 * CBT exam vibration (motor only - no sound).
 * Hierarchy (weakest -> strongest):
 *   start  <  unclear/none (amber)  <  multi  <  officer_warning
 *
 * Android APK: uses native ExamImmersive.vibrate (WebView navigator.vibrate is unreliable).
 * Web: navigator.vibrate fallback.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

export type HapticKind =
  | "start"
  | "none"
  | "unclear"
  | "multi"
  | "camera_blocked"
  | "tab_switch"
  | "officer_warning"
  | "officer_pause"
  | "officer_submit"
  | "light"
  | "strong";

const PATTERNS: Record<HapticKind, number[]> = {
  start: [0, 140, 60, 160],
  none: [0, 180, 50, 220, 50, 260, 55, 280],
  unclear: [0, 180, 50, 220, 50, 260, 55, 280],
  light: [0, 100, 50, 120],
  multi: [0, 200, 40, 240, 40, 280, 45, 320, 45, 360, 50, 400],
  strong: [0, 200, 40, 240, 40, 280, 45, 320, 45, 360, 50, 400],
  camera_blocked: [0, 160, 50, 200, 50, 240],
  tab_switch: [0, 90, 50, 120],
  officer_warning: [
    0, 250, 35, 300, 35, 350, 40, 400, 40, 450, 45, 500, 45, 550, 50, 600, 50, 650,
  ],
  // Medium-strong pulse for officer pause
  officer_pause: [0, 220, 40, 280, 40, 320, 45, 380, 45, 420],
  // Strong double-burst for force submit / terminate
  officer_submit: [0, 280, 35, 340, 35, 400, 40, 460, 40, 520, 45, 580],
};

type ExamImmersivePlugin = {
  vibrate(opts: { pattern?: number[]; ms?: number }): Promise<{ ok?: boolean }>;
  enter(): Promise<void>;
  exit(): Promise<void>;
};

let _immersive: ExamImmersivePlugin | null = null;
function ExamImmersive(): ExamImmersivePlugin {
  if (!_immersive) {
    _immersive = registerPlugin<ExamImmersivePlugin>("ExamImmersive");
  }
  return _immersive;
}

function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

let primed = false;
let timers: number[] = [];
let keepAliveTimer: number | null = null;
let lastKind: HapticKind | null = null;
let lastAt = 0;

export function canVibrate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (isNativeAndroid()) return true;
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    const win = window as Window & { vibrate?: (p: number | number[]) => boolean };
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

/** Prefer native Android Vibrator; fall back to navigator.vibrate. */
function vibrateRaw(arg: number | number[]): boolean {
  try {
    const pattern = Array.isArray(arg) ? arg : [arg];
    const normalized =
      pattern.length && pattern[0] === 0 ? pattern : [0, ...pattern];

    if (isNativeAndroid()) {
      try {
        void ExamImmersive().vibrate({ pattern: normalized });
        return true;
      } catch {
        /* fall through */
      }
    }

    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    const win = window as Window & { vibrate?: (p: number | number[]) => boolean };
    const fn =
      (typeof nav?.vibrate === "function" ? nav.vibrate.bind(nav) : null) ||
      (typeof win?.vibrate === "function" ? win.vibrate.bind(win) : null);
    if (fn) {
      try {
        return Boolean(fn(normalized.length === 2 && normalized[0] === 0 ? normalized[1] : normalized));
      } catch {
        /* ignore */
      }
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
      vibrateRaw([0, pulse]);
    }, delay);
    timers.push(id);
    delay += pulse + gap;
  }
}

function extractOns(pattern: number[]): number[] {
  const ons: number[] = [];
  const start = pattern[0] === 0 ? 1 : 0;
  for (let i = start; i < pattern.length; i += 2) {
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

export function refreshHapticUnlock() {
  primed = true;
}

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
    "officer_pause",
    "officer_submit",
    "tab_switch",
    "light",
    "strong",
  ];
  if (!allowed.includes(kind)) return;

  const now = Date.now();
  const cooldown =
    kind === "officer_warning" || kind === "officer_submit"
      ? 500
      : kind === "officer_pause"
        ? 600
        : kind === "multi"
          ? 700
          : kind === "start"
            ? 300
            : 900;
  if (lastKind === kind && now - lastAt < cooldown) return;
  lastKind = kind;
  lastAt = now;
  primed = true;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  const ons = extractOns(pattern);
  clearTimers();

  vibrateRaw(pattern);
  timers.push(
    window.setTimeout(() => pulseTrain(ons, kind === "start" ? 55 : 35), 30),
    window.setTimeout(() => vibrateRaw(pattern), 80),
  );

  if (kind === "multi") {
    timers.push(window.setTimeout(() => vibrateRaw([0, 280, 40, 320, 40, 380]), 300));
  }

  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(() => vibrateRaw([0, 300, 30, 350, 30, 400, 35, 450]), 150),
      window.setTimeout(() => pulseTrain([300, 350, 400, 450, 500, 550], 35), 20),
      window.setTimeout(() => vibrateRaw([0, 350, 30, 400, 30, 500, 30, 600]), 600),
      window.setTimeout(() => vibrateRaw([0, 400, 30, 500, 30, 600]), 1100),
    );
  }

  if (kind === "officer_pause") {
    timers.push(
      window.setTimeout(() => vibrateRaw([0, 240, 40, 300, 40, 360]), 200),
      window.setTimeout(() => vibrateRaw([0, 280, 40, 340]), 500),
    );
  }

  if (kind === "officer_submit") {
    timers.push(
      window.setTimeout(() => vibrateRaw([0, 320, 30, 380, 30, 440, 35, 500]), 180),
      window.setTimeout(() => vibrateRaw([0, 360, 30, 420, 30, 500]), 550),
      window.setTimeout(() => vibrateRaw([0, 400, 30, 500]), 1000),
    );
  }
}

export function hapticOfficerWarning() {
  haptic("officer_warning");
}
