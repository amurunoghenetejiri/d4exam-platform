/**
 * Publishes student screen-share JPEG frames to officer live-monitor.
 */
import { useEffect, useRef } from "react";
import { startLiveScreenPublisher, type LiveScreenPublisher } from "@/lib/live-video";
import { isNativeScreenShareActive } from "@/lib/screen-share";

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
    const hasStream = Boolean(opts.stream || opts.getStream?.() || isNativeScreenShareActive());

    if (!opts.enabled || !schoolId || !studentId || !examId || !attemptId || !hasStream) {
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

    pubRef.current = startLiveScreenPublisher({
      schoolId,
      attemptId,
      studentId,
      examId,
      getStream: () => optsRef.current.getStream?.() || optsRef.current.stream,
      intervalMs: 700,
    });

    return () => {
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
