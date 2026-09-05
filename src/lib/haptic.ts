/**
 * CBT exam vibration (motor only - no sound).
 * Hierarchy (weakest -> strongest):
 *   none/unclear < tab_switch < multi < officer_pause < officer_warning/submit
 *
 * Android APK: ExamImmersive.vibrate (native Vibrator) + navigator.vibrate fallback.
 * Web: navigator.vibrate.
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

/** Clear alternating delay/on patterns (ms). Keep relatively short so they always complete. */
const PATTERNS: Record<HapticKind, number[]> = {
  start: [0, 120, 60, 140],
  light: [0, 120],
  none: [0, 160, 60, 180],
  unclear: [0, 160, 60, 180],
  tab_switch: [0, 100, 50, 120],
  camera_blocked: [0, 180, 50, 200],
  multi: [0, 220, 50, 260, 50, 300],
  strong: [0, 240, 50, 280, 50, 320],
  officer_pause: [0, 260, 45, 300, 45, 340],
  officer_submit: [0, 300, 40, 360, 40, 420, 40, 480],
  officer_warning: [0, 320, 35, 380, 35, 440, 35, 500, 40, 560],
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
  const pattern = Array.isArray(arg) ? arg.map((n) => Math.max(0, Math.round(Number(n) || 0))) : [Math.max(0, Math.round(Number(arg) || 0))];
  if (!pattern.length) return [0, 200];
  return pattern[0] === 0 ? pattern : [0, ...pattern];
}

function vibrateWeb(pattern: number[]): boolean {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav?.vibrate !== "function") return false;
    // Cancel previous then fire
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

/** Fire native Android vibrator AND web fallback. Returns true if either path accepted. */
function vibrateRaw(arg: number | number[]): boolean {
  try {
    const pattern = normalizePattern(arg);
    let ok = false;

    if (isNativeAndroid()) {
      try {
        // Fire-and-forget but also attach catch so failures don't break exam UI
        void ExamImmersive()
          .vibrate({ pattern })
          .then((r) => {
            if (r && r.ok === false) {
              console.warn("[haptic] native vibrate rejected", r.error);
              vibrateWeb(pattern);
            }
          })
          .catch((e) => {
            console.warn("[haptic] native vibrate error", e);
            vibrateWeb(pattern);
          });
        ok = true;
      } catch (e) {
        console.warn("[haptic] native invoke failed", e);
      }
    }

    // Always try web path too (helps on some WebViews / when native is delayed)
    if (vibrateWeb(pattern)) ok = true;

    // Last resort: single pulse
    if (!ok) {
      ok = vibrateWeb([0, 200]);
    }
    return ok;
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

/** Unlock vibration from a user gesture (Start Exam). */
export function primeHaptics() {
  clearTimers();
  const pattern = PATTERNS.start;
  vibrateRaw(pattern);
  timers.push(
    window.setTimeout(() => {
      vibrateRaw(pattern);
    }, 50),
  );
  startHapticKeepAlive();
}

export function refreshHapticUnlock() {
  /* kept for API compatibility */
}

export function startHapticKeepAlive() {
  if (typeof window === "undefined") return;
  stopHapticKeepAlive();
  keepAliveTimer = window.setInterval(() => {
    /* keep module warm */
  }, 20_000);
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
  // Short cooldowns so rapid face events still feel, but don't stack forever
  const cooldown =
    kind === "officer_warning" || kind === "officer_submit"
      ? 400
      : kind === "multi" || kind === "officer_pause"
        ? 550
        : kind === "none" || kind === "unclear"
          ? 700
          : 450;
  if (lastKind === kind && now - lastAt < cooldown) return;
  lastKind = kind;
  lastAt = now;

  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  const ons = extractOns(pattern);
  clearTimers();

  // Primary fire
  vibrateRaw(pattern);

  // Reinforce once so weak devices still feel it
  timers.push(
    window.setTimeout(() => vibrateRaw(pattern), 60),
  );

  if (kind === "multi" || kind === "strong") {
    timers.push(window.setTimeout(() => vibrateRaw([0, 280, 40, 320]), 280));
  }

  if (kind === "officer_pause") {
    timers.push(window.setTimeout(() => vibrateRaw([0, 280, 40, 320]), 250));
  }

  if (kind === "officer_warning" || kind === "officer_submit") {
    timers.push(
      window.setTimeout(() => pulseTrain(ons.slice(0, 4), 35), 120),
      window.setTimeout(() => vibrateRaw([0, 350, 40, 420]), 500),
    );
  }
}

export function hapticOfficerWarning() {
  haptic("officer_warning");
}
