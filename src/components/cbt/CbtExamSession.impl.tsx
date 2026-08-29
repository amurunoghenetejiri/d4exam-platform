import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext, formatExamWindow } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { friendlyError } from "@/lib/friendly-error";
import { fromExamSettingsRow, type ExamSettingsRow } from "@/lib/exam-security";
import { parseExamMeta } from "@/lib/exam-meta";
import { loadExamQuestionBank, prepareStudentPaper } from "@/lib/cbt-load-questions";
import { type DeviceCapabilities } from "@/lib/device-capabilities";
import { toast } from "sonner";
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";
import { useLiveCamPublish } from "@/lib/use-live-cam-publish";
import { useLiveScreenPublish } from "@/lib/use-live-screen-publish";
import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream, isNativeScreenShareActive, getActiveScreenStream, refreshNativeScreenShareState, holdExamScreenShare } from "@/lib/screen-share";
// holdExamScreenShare patched below
import { openCameraStream, ensureMicrophonePermission } from "@/native/cameraService";
import { enterExamImmersive, exitExamImmersive } from "@/native/statusBar";
import { haptic } from "@/lib/haptic";
import {
  notifyStudentExamSubmitted,
  notifyStudentExamTerminated,
  notifyStudentExamAutoSubmitted,
} from "@/lib/notify";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    for (const t of stream.getTracks()) {
      try { t.stop(); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

async function requestExamFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  await enterExamImmersive();
  if (document.fullscreenElement) return true;
  try {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch { /* blocked */ }
  try {
    const { isNativeShell } = await import("@/native/platform");
    if (isNativeShell()) return true;
  } catch { /* ignore */ }
  return Boolean(document.fullscreenElement);
}

async function leaveExamFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.();
  } catch { /* ignore */ }
  await exitExamImmersive();
}

export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const previewMode = isPreviewPath();
  const { data: student } = useStudentContext();
  const { data: session } = useSessionUser();
  const { data: schoolBrand } = useSchoolIdentity(student?.schoolId ?? session?.schoolId);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [doneTerminated, setDoneTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState<string>("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState<number | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [fsGate, setFsGate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string>("");
  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const orderedIdsRef = useRef<string[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const faceStatusRef = useRef<string>("starting");
  const lastLoggedFaceRef = useRef<string>("");
  const answeredCountRef = useRef(0);
  const totalQuestionsRef = useRef(0);
  const timeRemainingRef = useRef<number | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  resultIdRef.current = resultId;

  const examQ = useQuery({
    queryKey: ["cbt-exam", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("examinations")
        .select("id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, courses(code, name)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["cbt-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await supabase.from("exam_settings")
        .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, pause_duration_seconds, face_violation_action, total_marks, instructions, result_visibility, questions_to_answer")
        .eq("exam_id", id).maybeSingle();
      return data as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.id),
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const exam = examQ.data!;
      return loadExamQuestionBank({
        courseId: String(exam.course_id),
        schoolId: exam.school_id ? String(exam.school_id) : null,
        examId: id || null,
      });
    },
  });

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);

  useLiveCamPublish({
    enabled: started && !done && !previewMode && !paused && Boolean(security.requireCamera),
    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,
    studentId: student?.studentId,
    examId: id,
    attemptId: liveAttemptId || attemptIdRef.current,
    stream: liveStream,
    getStream: () => mediaStreamRef.current || liveStream,
    getFaceStatus: () => faceStatusRef.current,
    getAnsweredCount: () => answeredCountRef.current,
    getTotalQuestions: () => totalQuestionsRef.current,
    getTimeRemainingSec: () => timeRemainingRef.current,
  });

  useLiveScreenPublish({
    enabled: started && !done && !previewMode,
    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,
    studentId: student?.studentId,
    examId: id,
    attemptId: liveAttemptId || attemptIdRef.current,
    stream: screenStream,
    getStream: () => screenStreamRef.current || screenStream || getActiveScreenStream(),
  });

  // Keep MediaProjection virtual display alive during exam
  useEffect(() => {
    if (!started || done || previewMode) return;
    holdExamScreenShare(true);
    let cancelled = false;
    const tick = async () => {
      try {
        const on = await refreshNativeScreenShareState();
        if (cancelled) return;
        if (on) {
          const s = getActiveScreenStream();
          if (s) {
            screenStreamRef.current = s;
            setScreenStream((prev) => prev || s);
          }
        }
      } catch { /* ignore */ }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [started, done, previewMode]);


  useEffect(() => {
    if (!started || done || previewMode) return;
    const tick = () => {
      const aid = attemptIdRef.current;
      if (!aid) return;
      const meta = {
        lastSeenAt: new Date().toISOString(),
        cameraActive: Boolean(mediaStreamRef.current || liveStream),
        screenActive: Boolean(screenStreamRef.current || screenStream || isNativeScreenShareActive()),
        faceStatus: faceStatusRef.current || "ok",
        answeredCount: answeredCountRef.current,
        totalQuestions: totalQuestionsRef.current,
        timeRemainingSec: timeRemainingRef.current,
        fullscreen: typeof document !== "undefined" ? Boolean(document.fullscreenElement) : false,
        studentName: session?.fullName || student?.fullName || undefined,
      };
      void supabase.from("exam_attempts").update({ metadata: meta, updated_at: new Date().toISOString() } as never).eq("id", aid);
    };
    tick();
    const t = window.setInterval(tick, 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, previewMode, liveStream, session?.fullName, student?.fullName]);

  const shutdownMedia = useCallback(() => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try {
      holdExamScreenShare(false);
      stopScreenShareStream(screenStreamRef.current);
    } catch {
      /* ignore */
    }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);

  useEffect(() => {
    if (!started || done || seconds == null) return;
    if (seconds <= 0) { void finishAttempt(true); return; }
    const t = window.setInterval(() => setSeconds((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, seconds === 0]);

  useEffect(() => {
    if (done) {
      shutdownMedia();
      setFsGate(false);
      setPaused(false);
      setWarnBanner(null);
      void leaveExamFullscreen();
    }
  }, [done, shutdownMedia]);

  // Re-assert immersive chrome while the exam is active.
  useEffect(() => {
    if (!started || done) return;
    void enterExamImmersive();
    const t = window.setInterval(() => {
      void enterExamImmersive();
    }, 8000);
    return () => window.clearInterval(t);
  }, [started, done]);

  // Officer warnings from live monitor — top banner + haptic during the attempt
  useEffect(() => {
    if (!started || done || previewMode) return;
    const studentId = student?.studentId;
    if (!studentId || !id) return;

    const showWarn = (raw?: string | null) => {
      const msg =
        String(raw || "").trim() ||
        "Officer warning: Follow exam rules. Further violations may void your result.";
      setWarnBanner(msg);
      try {
        haptic("officer_warning");
      } catch {
        /* ignore */
      }
      window.setTimeout(() => setWarnBanner(null), 12_000);
    };

    // 1) Broadcast channel — im
/*__MORE__*/
