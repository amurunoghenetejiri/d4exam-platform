/**
 * Lightweight exam_attempts activity heartbeat for officer live discovery.
 * Updates updated_at + metadata.lastSeenAt only — never answers/status.
 */
import { supabase } from "@/integrations/supabase/client";

export async function pulseExamAttempt(attemptId: string | null | undefined): Promise<void> {
  const id = String(attemptId || "");
  if (!id) return;
  try {
    const nowIso = new Date().toISOString();
    const { data: row } = await supabase
      .from("exam_attempts")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();
    const prevMeta =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const { error } = await supabase
      .from("exam_attempts")
      .update({
        updated_at: nowIso,
        metadata: { ...prevMeta, lastSeenAt: nowIso },
      } as never)
      .eq("id", id)
      .in("status", ["in_progress", "paused", "held", "active"]);
    if (error) console.warn("[cbt] attempt heartbeat", error);
  } catch (e) {
    console.warn("[cbt] attempt heartbeat", e);
  }
}
