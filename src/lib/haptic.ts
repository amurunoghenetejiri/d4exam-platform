/**
 * CBT exam vibration (motor only — no sound).
 * Hierarchy (weakest → strongest):
 *   none/unclear < tab_switch < multi < officer_pause < officer_warning/submit
 *
 * Android APK: ExamImmersive.vibrate (native Vibrator) ONLY — do not also call
 * navigator.vibrate on native, because WebView vibrate(0) cancels the motor.
 * Web / PWA: navigator.vibrate.
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
  | "strong"
  | "success";

/** Alternating [delay, on, delay, on, ...] in ms. Tuned for clear feel on mid-range Android motors. */
const PATTERNS: Record<HapticKind, number[]> = {
  start: [0, 180, 50, 200],
  success: [0, 140, 40, 180],
  light: [0, 160],
  none: [0, 220, 50, 240],
  unclear: [0, 220, 50, 240],
  tab_switch: [0, 160, 40, 180],
  camera_blocked: [0, 240, 45, 280],
  multi: [0, 280, 40, 320, 40, 360],
  strong: [0, 300, 40, 340, 40, 380],
  officer_pause: [0, 320, 35, 360, 35, 400],
  officer_submit: [0, 360, 30, 420, 30, 480, 30, 540],
  officer_warning: [0, 380, 28, 440, 28, 500, 28, 560, 30, 620],
};

type ExamImmersivePlugin = {
  vibrate(opts: { pattern?: number[]; ms?: number }): Promise<{ ok?: boolean; error?: string }>;
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

let timers: number[] = [];
let keepAliveTimer: number | null = null;
let lastKind: HapticKind | null = null;
let lastAt = 0;
/** True after a user gesture unlocked vibration this session. */
let unlocked = false;

export function canVibrate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (isNativeAndroid()) return true;
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    return typeof nav?.vibrate === "function";
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

function normalizePattern(arg: number | number[]): number[] {
  const pattern = Array.isArray(arg)
    ? arg.map((n) => Math.max(0, Math.round(Number(n) || 0)))
    : [Math.max(0, Math.round(Number(arg) || 0))];
  if (!pattern.length) return [0, 220];
  return pattern[0] === 0 ? pattern : [0, ...pattern];
}

function vibrateWeb(pattern: number[], cancelFirst = true): boolean {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav?.vibrate !== "function") return false;
    if (cancelFirst) {
      try {
        nav.vibrate(0);
      } catch {
        /* ignore */
      }
    }
    return Boolean(nav.vibrate(pattern));
  } catch {
    return false;
  }
}

/**
 * Fire the motor. On native Android use ONLY the Capacitor plugin —
 * never navigator.vibrate, which cancels the native vibrator on many WebViews.
 */
function vibrateRaw(arg: number | number[]): boolean {
  try {
    const pattern = normalizePattern(arg);

    if (isNativeAndroid()) {
      try {
        void ExamImmersive()
          .vibrate({ pattern })
          .then((r) => {
            if (r && r.ok === false) {
              console.warn("[haptic] native vibrate rejected", r.error);
              // Only fall back to web if native truly failed
              vibrateWeb(pattern, true);
            }
          })
          .catch((e) => {
            console.warn("[haptic] native vibrate error", e);
            vibrateWeb(pattern, true);
          });
        return true;
      } catch (e) {
        console.warn("[haptic] native invoke failed", e);
        return vibrateWeb(pattern, true);
      }
    }

    // Web / iOS PWA / desktop
    if (vibrateWeb(pattern, true)) return true;
    return vibrateWeb([0, 220], true);
  } catch {
    return false;
  }
}

function extractOns(pattern: number[]): number[] {
  const ons: number[] = [];
  const start = pattern[0] === 0 ? 1 : 0;
  for (let i = start; i < pattern.length; i += 2) {
    if (typeof pattern[i] === "number" && pattern[i] > 0) ons.push(pattern[i]);
  }
  return ons.length ? ons : [220];
}

function pulseTrain(ons: number[], gap = 40) {
  let delay = 0;
  for (const pulse of ons) {
    const id = window.setTimeout(() => {
      vibrateRaw([0, pulse]);
    }, delay);
    timers.push(id);
    delay += pulse + gap;
  }
}

/** Unlock vibration from a user gesture (Start Exam / first touch). */
export function primeHaptics() {
  if (typeof window === "undefined") return;
  unlocked = true;
  clearTimers();
  const pattern = PATTERNS.start;
  vibrateRaw(pattern);
  timers.push(
    window.setTimeout(() => {
      vibrateRaw(pattern);
    }, 90),
  );
  startHapticKeepAlive();
}

/**
 * Re-assert unlock while the student interacts with the exam UI.
 * Call from touch/pointer handlers so the motor stays available after backgrounding.
 */
export function refreshHapticUnlock() {
  if (typeof window === "undefined") return;
  unlocked = true;
  // Tiny tick on native only — keeps the plugin path warm without annoying the student
  if (isNativeAndroid()) {
    try {
      void ExamImmersive().vibrate({ pattern: [0, 1] });
    } catch {
      /* ignore */
    }
  }
}

export function startHapticKeepAlive() {
  if (typeof window === "undefined") return;
  stopHapticKeepAlive();
  // Lightweight interval: does not vibrate, only keeps timers/module alive
  keepAliveTimer = window.setInterval(() => {
    /* module warm */
  }, 25_000);
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

  const now = Date.now();
  const cooldown =
    kind === "officer_warning" || kind === "officer_submit"
      ? 450
      : kind === "multi" || kind === "officer_pause" || kind === "strong"
        ? 550
        : kind === "none" || kind === "unclear"
          ? 700
          : 420;
  if (lastKind === kind && now - lastAt < cooldown) return;
  lastKind = kind;
  lastAt = now;

  // Auto-unlock on first exam haptic if Start Exam already ran primeHaptics
  if (!unlocked && (kind === "start" || kind === "success" || kind === "light")) {
    unlocked = true;
  }

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  const ons = extractOns(pattern);
  clearTimers();

  // Primary fire
  vibrateRaw(pattern);

  // Reinforce so weak motors still register
  timers.push(window.setTimeout(() => vibrateRaw(pattern), 80));

  if (kind === "multi" || kind === "strong") {
    timers.push(window.setTimeout(() => vibrateRaw([0, 340, 35, 380]), 320));
  }

  if (kind === "officer_pause") {
    timers.push(window.setTimeout(() => vibrateRaw([0, 340, 35, 380]), 300));
  }

  if (kind === "officer_warning" || kind === "officer_submit") {
    timers.push(
      window.setTimeout(() => pulseTrain(ons.slice(0, 5), 30), 110),
      window.setTimeout(() => vibrateRaw([0, 420, 35, 500]), 560),
    );
  }
}

export function hapticOfficerWarning() {
  haptic("officer_warning");
}
