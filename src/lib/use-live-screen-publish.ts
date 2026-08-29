/**
 * Publishes student screen-share JPEG frames to officer live-monitor.
 * On Android, frames come from MediaProjection via awaitLatestNativeScreenJpeg.
 * Publisher stays up for the whole exam session (not tied to one React mount only).
 */
import { useEffect, useRef } from "react";
import { startLiveScreenPublisher, type LiveScreenPublisher } from "@/lib/live-video";
import {
  holdExamScreenShare,
  refreshNativeScreenShareState,
  isNativeScreenShareActive,
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
  const attemptId =
    String(opts.attemptId || "") ||
    (studentId && examId ? `pending:${studentId}:${examId}` : "");

  // Publish for entire active exam once identity is known.
  // Native frames may exist even when React MediaStream is empty.
  const enabled =
    opts.enabled && Boolean(schoolId && studentId && examId && attemptId);

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

    holdExamScreenShare(true);

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
      // ~2 fps — enough for monitoring without saturating Realtime
      intervalMs: 500,
    });

    const sync = window.setInterval(() => {
      void refreshNativeScreenShareState().then((on) => {
        if (!on && isNativeScreenShareActive()) {
          /* already marked from recent frames */
        }
      });
    }, 1500);

    return () => {
      window.clearInterval(sync);
      try {
        pubRef.current?.stop();
      } catch {
        /* ignore */
      }
      pubRef.current = null;
      // Do NOT release exam hold here — only submit/shutdown clears hold.
    };
  }, [enabled, schoolId, studentId, examId, attemptId]);
}
