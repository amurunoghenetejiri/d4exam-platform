import { useEffect, useRef } from "react";
import { pulseExamAttempt } from "@/lib/cbt-attempt-heartbeat";

/** Keep exam_attempts.updated_at / metadata.lastSeenAt fresh while writing. */
export function useExamAttemptHeartbeat(opts: {
  enabled: boolean;
  attemptId: string | null | undefined;
}) {
  const idRef = useRef(opts.attemptId);
  idRef.current = opts.attemptId;

  useEffect(() => {
    if (!opts.enabled) return;
    const id = String(opts.attemptId || "");
    if (!id) return;
    void pulseExamAttempt(id);
    const t = window.setInterval(() => {
      void pulseExamAttempt(idRef.current);
    }, 20_000);
    return () => window.clearInterval(t);
  }, [opts.enabled, opts.attemptId]);
}
