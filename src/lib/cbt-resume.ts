/** Helpers for continuing an in-progress CBT attempt. */

export function remainingSecondsFromStart(
  startedAtIso: string,
  durationMinutes: number,
): number {
  const durationSec = Math.max(1, durationMinutes) * 60;
  const elapsed = Math.floor((Date.now() - new Date(startedAtIso).getTime()) / 1000);
  return Math.max(0, durationSec - elapsed);
}

export function restoreAnswers(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number") out[k] = v;
  }
  return out;
}
