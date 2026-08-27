/**
 * Publishes student screen-share JPEG frames to officer live-monitor.
 * On Android, frames come from MediaProjection via getLatestNativeScreenJpeg — no MediaStream required.
 */
import { useEffect, useRef } from "react";
import { startLiveScreenPublisher, type LiveScreenPublisher } from "@/lib/live-video";
import { refreshNativeScreenShareState } from "@/lib/screen-share";

export function useLiveScreenPublish(opts: {
  enabled: boolean;
  schoolId: string | null | undefined;
  studentId: string | null | undefined;
  examId: string | null | undefined;
  attemptId: string | null | undefined;
  stream: MediaStream | null;
  getStream?: () => MediaStream | null;
}) {
  const pubRef = useRef<LiveScreenPublisher | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const schoolId = String(opts.schoolId || "");
    const studentId = String(opts.studentId || "");
    const examId = String(opts.examId || "");
    const attemptId = String(opts.attemptId || "");

    // Do not require stream up-front — native JPEG path works without MediaStream tracks
    if (!opts.enabled || !schoolId || !studentId || !examId || !attemptId) {
      try {
        pubRef.current?.stop();
      } catch {
        /* ignore */
      }
      pubRef.current = null;
      return;
    }

    try {
      pubRef.current?.stop();
    } catch {
      /* ignore */
    }

    void refreshNativeScreenShareState();

    pubRef.current = startLiveScreenPublisher({
      schoolId,
      attemptId,
      studentId,
      examId,
      getStream: () => optsRef.current.getStream?.() || optsRef.current.stream,
      intervalMs: 600,
    });

    const sync = window.setInterval(() => {
      void refreshNativeScreenShareState();
    }, 5000);

    return () => {
      window.clearInterval(sync);
      try {
        pubRef.current?.stop();
      } catch {
        /* ignore */
      }
      pubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.schoolId, opts.studentId, opts.examId, opts.attemptId, opts.stream]);
}
