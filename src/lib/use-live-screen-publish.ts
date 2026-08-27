/**
 * Publishes student screen-share JPEG frames to officer live-monitor.
 * On Android, frames come from MediaProjection via getLatestNativeScreenJpeg —
 * no MediaStream tracks required.
 *
 * Uses a stable publisher that restarts only when identity keys change.
 * Falls back to studentId:examId when attemptId is not yet available so
 * frames can start flowing as soon as capture is active.
 */
import { useEffect, useRef } from "react";
import { startLiveScreenPublisher, type LiveScreenPublisher } from "@/lib/live-video";
import {
  isNativeScreenShareActive,
  refreshNativeScreenShareState,
} from "@/lib/screen-share";

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

  const schoolId = String(opts.schoolId || "");
  const studentId = String(opts.studentId || "");
  const examId = String(opts.examId || "");
  // Prefer real attempt id; provisional key keeps channel identity stable until attempt is created
  const attemptId = String(opts.attemptId || "") || (studentId && examId ? `pending:${studentId}:${examId}` : "");
  const enabled =
    opts.enabled &&
    Boolean(schoolId && studentId && examId && attemptId) &&
    (Boolean(opts.stream) || isNativeScreenShareActive() || Boolean(opts.getStream));

  useEffect(() => {
    if (!enabled) {
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
      intervalMs: 550,
    });

    const sync = window.setInterval(() => {
      void refreshNativeScreenShareState();
    }, 4000);

    return () => {
      window.clearInterval(sync);
      try {
        pubRef.current?.stop();
      } catch {
        /* ignore */
      }
      pubRef.current = null;
    };
  }, [enabled, schoolId, studentId, examId, attemptId]);
}
