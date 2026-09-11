/**
 * CBT exam vibration — max strength continuous motor.
 * none/tab ~1.6s hard | multi ~2.2s harder | officer_warning loudest longest
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

function burst(totalOnMs: number, pulseMs = 160, gapMs = 8): number[] {
  const out: number[] = [0];
  let remaining = Math.max(400, totalOnMs);
  while (remaining > 0) {
    const on = Math.min(pulseMs, remaining);
    out.push(on);
    remaining -= on;
    if (remaining > 0) out.push(gapMs);
  }
  return out;
}

const PATTERNS: Record<HapticKind, number[]> = {
  start: [0, 280, 40, 400],
  none: burst(1600, 180, 6),
  unclear: burst(1600, 180, 6),
  light: burst(1600, 180, 6),
  tab_switch: burst(1600, 180, 6),
  multi: burst(2200, 200, 5),
  strong: burst(2200, 200, 5),
  camera_blocked: burst(2200, 200, 5),
  officer_pause: burst(2200, 200, 5),
  officer_submit: burst(2200, 200, 5),
  officer_warning: burst(3000, 220, 4),
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
  const p = pattern.length ? pattern : [0, 500];
  try {
    if (Capacitor.isNativePlatform()) {
      const totalOn = p.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);
      if (totalOn >= 800) {
        const ret = await ExamImmersive.vibrate({ ms: totalOn, pattern: p });
        if (!(ret && ret.ok === false)) return true;
      }
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
  fire([0, 40]);
  fire(PATTERNS.start);
  timers.push(window.setTimeout(() => fire(PATTERNS.start), 90));
}

export function refreshHapticUnlock() {
  primed = true;
  fire([0, 30]);
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;
  const pattern = PATTERNS[kind] ?? PATTERNS.none;
  clearTimers();
  fire(pattern);

  const solid =
    kind === "officer_warning"
      ? 2800
      : kind === "multi" ||
          kind === "strong" ||
          kind === "camera_blocked" ||
          kind === "officer_pause" ||
          kind === "officer_submit"
        ? 2200
        : 1600;

  fire([0, solid]);
  timers.push(
    window.setTimeout(() => fire([0, solid]), 30),
    window.setTimeout(() => fire(pattern), 40),
    window.setTimeout(() => fire([0, solid]), 80),
    window.setTimeout(() => fire(pattern), 180),
    window.setTimeout(() => fire([0, Math.floor(solid * 0.85)]), 280),
    window.setTimeout(() => fire(pattern), 500),
  );

  if (kind === "multi" || kind === "strong") {
    timers.push(
      window.setTimeout(() => fire(burst(1800, 200, 5)), 400),
      window.setTimeout(() => fire([0, 1200]), 900),
    );
  }

  if (kind === "officer_warning") {
    timers.push(
      window.setTimeout(() => fire(burst(2200, 220, 4)), 500),
      window.setTimeout(() => fire([0, 1500]), 1200),
      window.setTimeout(() => fire(burst(1200, 220, 4)), 2200),
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
