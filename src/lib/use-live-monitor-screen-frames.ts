/**
 * Officer: subscribe to student screen-share frames (Realtime broadcast).
 */
import { useEffect, useState } from "react";
import { startLiveScreenSubscriber } from "@/lib/live-video";

export function useLiveMonitorScreenFrames(schoolId: string | null | undefined) {
  const [screenFrames, setScreenFrames] = useState<Record<string, { src: string; ts: number }>>({});

  useEffect(() => {
    if (!schoolId) return;
    const sub = startLiveScreenSubscriber({
      schoolId,
      onFrame: (p) => {
        const attemptId = p.attemptId || (p as { attempt_id?: string }).attempt_id;
        if (!attemptId || !p.frame) return;
        const entry = { src: p.frame, ts: p.ts || Date.now() };
        const sid = String(p.studentId || (p as { student_id?: string }).student_id || "");
        setScreenFrames((prev) => {
          const next = { ...prev, [attemptId]: entry };
          if (sid) next[`student:${sid}`] = entry;
          return next;
        });
      },
    });
    return () => sub.stop();
  }, [schoolId]);

  return screenFrames;
}
