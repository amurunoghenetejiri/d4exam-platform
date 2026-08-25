/**
 * Publishes student exam camera JPEG frames to officer live-monitor
 * via Supabase Realtime (startLiveCamPublisher).
 */
import { useEffect, useRef } from "react";
import { startLiveCamPublisher, type LiveCamPublisher } from "@/lib/live-video";

export function useLiveCamPublish(opts: {
  enabled: boolean;
  schoolId: string | null | undefined;
  studentId: string | null | undefined;
  examId: string | null | undefined;
  attemptId: string | null | undefined;
  stream: MediaStream | null;
  getStream?: () => MediaStream | null;
  getFaceStatus?: () => string;
}) {
  const pubRef = useRef<LiveCamPublisher | null>(null);

  useEffect(() => {
    const schoolId = String(opts.schoolId || "");
    const studentId = String(opts.studentId || "");
    const examId = String(opts.examId || "");
    const attemptId = String(opts.attemptId || "");
    const hasStream = Boolean(opts.stream || opts.getStream?.());

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

    pubRef.current = startLiveCamPublisher({
      schoolId,
      attemptId,
      studentId,
      examId,
      getStream: () => opts.getStream?.() || opts.stream,
      getFaceMeta: () => ({
        faceStatus: opts.getFaceStatus?.() || "ok",
        cameraActive: true,
      }),
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
  }, [
    opts.enabled,
    opts.schoolId,
    opts.studentId,
    opts.examId,
    opts.attemptId,
    opts.stream,
  ]);
}
