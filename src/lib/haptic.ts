/**
 * CBT exam vibration — max amplitude native; long continuous bursts.
 * no-face / tab: ~1.5s hard | multi / officer: ~2s+ hard high pulse rate
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

function burst(totalOnMs: number, pulseMs = 120, gapMs = 12): number[] {
  const out: number[] = [0];
  let remaining = Math.max(300, totalOnMs);
  while (remaining > 0) {
    const on = Math.min(pulseMs, remaining);
    out.push(on);
    remaining -= on;
    if (remaining > 0) out.push(gapMs);
  }
  return out;
}

const PATTERNS: Record<HapticKind, number[]> = {
  start: [0, 250, 40, 350],
  none: burst(1500, 140, 10),
  unclear: burst(1500, 140, 10),
  light: burst(1500, 140, 10),
  tab_switch: burst(1500, 140, 10),
  multi: burst(2000, 150, 8),
  strong: burst(2000, 150, 8),
  camera_blocked: burst(2000, 150, 8),
  officer_pause: burst(2000, 150, 8),
  officer_submit: burst(2000, 150, 8),
  officer_warning: burst(2600, 160, 8),
};

type ExamImmersivePlugin = {
  vibrate: (opts: { pattern?: number[]; ms?: number }) => Promise<{ ok?: boolean; error?: string }>;
};

const ExamImmersive = registerPlugin<ExamImmersivePlugin>("ExamImmersive");

let primed = false;
let timers: number[] = [];

export function canVibrate(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (Capacitor.isNativePlatform()) return true;
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  } catch {
    return false;
  }
}

function clearTimers() {
  for (const t of timers) {
    try {
      window.clearTimeout(t);
    } catch {
      /* ignore */
    }
  }
  timers = [];
}

async function vibratePattern(pattern: number[]): Promise<boolean> {
  const p = pattern.length ? pattern : [0, 400];
  try {
    if (Capacitor.isNativePlatform()) {
      const ret = await ExamImmersive.vibrate({ pattern: p });
      if (!(ret && ret.ok === false)) return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      return navigator.vibrate(p);
    }
  } catch {
    /* ignore */
  }
  return false;
}

function fire(pattern: number[]) {
  void vibratePattern(pattern);
}

export function primeHaptics() {
  primed = true;
  clearTimers();
  fire([0, 30]);
  fire(PATTERNS.start);
  timers.push(window.setTimeout(() => fire(PATTERNS.start), 100));
}

export function refreshHapticUnlock() {
  primed = true;
  fire([0, 25]);
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;
  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  clearTimers();
  fire(pattern);
  const solid =
    kind === "none" || kind === "unclear" || kind === "tab_switch" || kind === "light"
      ? 1500
      : kind === "officer_warning"
        ? 2500
        : 2000;
  fire([0, solid]);
  timers.push(
    window.setTimeout(() => fire(pattern), 40),
    window.setTimeout(() => fire([0, solid]), 50),
    window.setTimeout(() => fire(pattern), 200),
    window.setTimeout(() => fire([0, Math.floor(solid * 0.7)]), 350),
  );
  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(() => fire(burst(2000, 160, 8)), 600),
      window.setTimeout(() => fire([0, 1000]), 2200),
    );
  }
}

export function hapticExamStart() {
  haptic("start");
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
export function hapticLightWarning() {
  haptic("none");
}
export function hapticStrongWarning() {
  haptic("multi");
}
export function isHapticPrimed() {
  return primed;
}
