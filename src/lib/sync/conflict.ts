import type { ConflictPolicy } from "./types";

/**
 * Explicit per-entity conflict policy for D4EXAM.
 * Exam answers / CBT not handled in Step 4.
 */
export function conflictPolicyFor(entityType: string): ConflictPolicy {
  const e = entityType.toLowerCase();
  if (
    e.includes("result") ||
    e.includes("examination") ||
    e.includes("exam_setting") ||
    e.includes("approval") ||
    e.includes("profile") ||
    e.includes("session")
  ) {
    return "server_wins";
  }
  if (e.includes("notification")) return "merge_notifications";
  if (e.includes("pref") || e.includes("local_setting")) return "local_wins";
  if (e.includes("attempt") || e.includes("answer") || e.includes("integrity")) {
    return "mark_conflict"; // offline CBT deferred
  }
  return "server_wins";
}

export function shouldApplyServerRecord(
  entityType: string,
  localUpdatedAt: string | null | undefined,
  serverUpdatedAt: string | null | undefined,
): boolean {
  const policy = conflictPolicyFor(entityType);
  if (policy === "server_wins" || policy === "merge_notifications") return true;
  if (policy === "local_wins") return false;
  if (policy === "mark_conflict") {
    if (!localUpdatedAt) return true;
    if (!serverUpdatedAt) return false;
    return new Date(serverUpdatedAt).getTime() >= new Date(localUpdatedAt).getTime();
  }
  return true;
}
