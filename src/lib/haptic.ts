/**
 * CBT exam vibration (motor only — no sound).
 * Hierarchy (weakest → strongest):
 *   light < tab_switch < none/unclear < multi/strong < officer_pause < officer_warning/submit
 *
 * Android APK: ExamImmersive.vibrate only (native Vibrator).
 *   Do NOT also call navigator.vibrate on Android — WebView often cancels the native motor.
 * Web / browser: navigator.vibrate.
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

/**
 * Alternating [delay, on, delay, on, ...] in ms (navigator.vibrate / Android waveform format).
 * Longer on-pulses so mid/low-end phones actually feel them.
 */
const PATTERNS: Record<HapticKind, number[]> = {
  start: [0, 80, 40, 120],
  light: [0, 60],
  tab_switch: [0, 90, 40, 110],
  none: [0, 140, 50, 160],
  unclear: [0, 150, 50, 170],
  camera_blocked: [0, 180, 45, 200],
  multi: [0, 200, 40, 240, 40, 280],
  strong: [0, 260, 40, 300, 40, 340],
  officer_pause: [0, 280, 40, 320, 40, 360],
  officer_submit: [0, 320, 35, 380, 35, 440, 35, 500],
  officer_warning: [0, 340, 30, 400, 30, 460, 30, 520, 35, 580],
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

function isNativeIos(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

let timers: number[] = [];
let keepAliveTimer: number | null = null;
let lastKind: HapticKind | null = null;
let lastAt = 0;

export function canVibrate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (isNativeAndroid() || isNativeIos()) return true;
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
  if (!pattern.length) return [0, 200];
  // Cap individual segments so the motor doesn't get cut off by OS limits
  const capped = pattern.map((n) => Math.min(n, 2000));
  return capped[0] === 0 ? capped : [0, ...capped];
}

function vibrateWeb(pattern: number[]): boolean {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav?.vibrate !== "function") return false;
    try {
      nav.vibrate(0);
    } catch {
      /* ignore */
    }
    return Boolean(nav.vibrate(pattern));
  } catch {
    return false;
  }
}

/**
 * Fire the motor.
 * Android: native ExamImmersive ONLY (WebView vibrate often cancels native).
 * Web: navigator.vibrate.
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
              // Only fall back to web if native explicitly failed
              vibrateWeb(pattern);
            }
          })
          .catch((e) => {
            console.warn("[haptic] native vibrate error", e);
            vibrateWeb(pattern);
          });
        return true;
      } catch (e) {
        console.warn("[haptic] native invoke failed", e);
        return vibrateWeb(pattern);
      }
    }

    // Browser / iOS WebView
    if (vibrateWeb(pattern)) return true;
    return vibrateWeb([0, 200]);
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
  return ons.length ? ons : [200];
}

function patternDurationMs(pattern: number[]): number {
  return pattern.reduce((a, b) => a + b, 0);
}

function pulseTrain(ons: number[], gap = 45) {
  let delay = 0;
  for (const pulse of ons) {
    const id = window.setTimeout(() => {
      vibrateRaw([0, pulse]);
    }, delay);
    timers.push(id);
    delay += pulse + gap;
  }
}

/** Unlock vibration from a user gesture (Start Exam). Call once on Start. */
export function primeHaptics() {
  clearTimers();
  const pattern = PATTERNS.start;
  vibrateRaw(pattern);
  // Second kick shortly after so the motor is clearly felt on first start
  timers.push(
    window.setTimeout(() => {
      vibrateRaw([0, 100, 40, 140]);
    }, 70),
  );
  startHapticKeepAlive();
}

export function refreshHapticUnlock() {
  /* API compatibility — no-op */
}

export function startHapticKeepAlive() {
  if (typeof window === "undefined") return;
  stopHapticKeepAlive();
  // Keep the module warm; do not vibrate on interval (that would drain battery / annoy)
  keepAliveTimer = window.setInterval(() => {
    /* no-op */
  }, 30_000);
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
      ? 500
      : kind === "multi" || kind === "officer_pause" || kind === "strong"
        ? 600
        : kind === "none" || kind === "unclear"
          ? 750
          : 400;
  if (lastKind === kind && now - lastAt < cooldown) return;
  lastKind = kind;
  lastAt = now;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  const ons = extractOns(pattern);
  const totalMs = patternDurationMs(pattern);
  clearTimers();

  // Primary fire
  vibrateRaw(pattern);

  // One reinforcement after the main pattern ends so weak motors still register
  const reinforceAt = Math.max(80, Math.min(totalMs + 20, 900));
  timers.push(
    window.setTimeout(() => {
      if (kind === "light" || kind === "tab_switch") {
        vibrateRaw([0, 70]);
      } else if (kind === "officer_warning" || kind === "officer_submit") {
        vibrateRaw([0, 300, 40, 360]);
      } else if (kind === "strong" || kind === "multi" || kind === "officer_pause") {
        vibrateRaw([0, 240, 40, 280]);
      } else {
        vibrateRaw([0, 160]);
      }
    }, reinforceAt),
  );

  // Extra pulse train for the strongest exam events
  if (kind === "officer_warning" || kind === "officer_submit") {
    timers.push(
      window.setTimeout(() => pulseTrain(ons.slice(0, 3), 40), 100),
    );
  }
}

export function hapticOfficerWarning() {
  haptic("officer_warning");
}
