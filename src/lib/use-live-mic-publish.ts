/**
 * Publish student microphone PCM chunks while an exam is in progress.
 */
import { useEffect, useRef } from "react";
import { startLiveMicPublisher, type LiveMicPublisher } from "@/lib/live-audio";

export function useLiveMicPublish(opts: {
  enabled: boolean;
  schoolId?: string | null;
  studentId?: string | null;
  examId?: string | null;
  attemptId?: string | null;
  getStream: () => MediaStream | null;
}) {
  const pubRef = useRef<LiveMicPublisher | null>(null);
  const getStreamRef = useRef(opts.getStream);
  getStreamRef.current = opts.getStream;

  useEffect(() => {
    const schoolId = opts.schoolId;
    const attemptId = opts.attemptId;
    if (!opts.enabled || !schoolId || !attemptId) {
      pubRef.current?.stop();
      pubRef.current = null;
      return;
    }

    pubRef.current?.stop();
    pubRef.current = startLiveMicPublisher({
      schoolId,
      attemptId,
      studentId: opts.studentId,
      examId: opts.examId,
      getStream: () => getStreamRef.current(),
    });

    return () => {
      pubRef.current?.stop();
      pubRef.current = null;
    };
  }, [opts.enabled, opts.schoolId, opts.attemptId, opts.studentId, opts.examId]);
}
