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
  getAnsweredCount?: () => number;
  getTotalQuestions?: () => number;
  getTimeRemainingSec?: () => number | null;
}) {
  const pubRef = useRef<LiveCamPublisher | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const schoolId = String(opts.schoolId || "");
    const studentId = String(opts.studentId || "");
    const examId = String(opts.examId || "");
    const attemptId = String(opts.attemptId || "");

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

    pubRef.current = startLiveCamPublisher({
      schoolId,
      attemptId,
      studentId,
      examId,
      getStream: () => {
        const o = optsRef.current;
        return o.getStream?.() || o.stream;
      },
      getFaceMeta: () => {
        const o = optsRef.current;
        const raw = String(o.getFaceStatus?.() || "ok").toLowerCase();
        const faceStatus =
          raw === "ok" || raw === "none" || raw === "multi" || raw === "unclear" || raw === "unavailable"
            ? raw
            : "ok";
        const stream = o.getStream?.() || o.stream;
        return {
          faceStatus,
          cameraActive: Boolean(stream),
          answeredCount: o.getAnsweredCount?.(),
          totalQuestions: o.getTotalQuestions?.(),
          timeRemainingSec: o.getTimeRemainingSec?.() ?? null,
        };
      },
      intervalMs: 600,
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
