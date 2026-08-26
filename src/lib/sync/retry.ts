/** Safe retry / backoff helpers. No infinite loops. */

export const MAX_OUTBOX_ATTEMPTS = 8;

export function isPermanentError(message: string | null | undefined): boolean {
  const m = (message || "").toLowerCase();
  if (!m) return false;
  return (
    m.includes("permission") ||
    m.includes("row-level security") ||
    m.includes("rls") ||
    m.includes("not authorized") ||
    m.includes("forbidden") ||
    m.includes("invalid") ||
    m.includes("duplicate key") ||
    m.includes("unique constraint") ||
    m.includes("violates")
  );
}

export function isTemporaryError(message: string | null | undefined): boolean {
  const m = (message || "").toLowerCase();
  if (!m) return true;
  return (
    m.includes("network") ||
    m.includes("fetch") ||
    m.includes("timeout") ||
    m.includes("offline") ||
    m.includes("failed to fetch") ||
    m.includes("abort") ||
    m.includes("5")
  );
}

/** Exponential backoff in ms: 1s, 2s, 4s… capped at 5 min. */
export function backoffMs(attempts: number): number {
  const base = Math.min(300_000, 1000 * Math.pow(2, Math.max(0, attempts - 1)));
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}

export function shouldRetryOutbox(attempts: number, lastError: string | null): boolean {
  if (attempts >= MAX_OUTBOX_ATTEMPTS) return false;
  if (isPermanentError(lastError)) return false;
  return true;
}
