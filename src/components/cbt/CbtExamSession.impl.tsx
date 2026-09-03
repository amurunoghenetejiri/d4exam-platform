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
import { openCameraStream, ensureMicrophonePermission } from "@/native/cameraService";
import { enterExamImmersive, exitExamImmersive } from "@/native/statusBar";
import { haptic } from "@/lib/haptic";
import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream, holdExamScreenShare } from "@/lib/screen-share";
import { useLiveScreenPublish } from "@/lib/use-live-screen-publish";
import { useLiveCamPublish } from "@/lib/use-live-cam-publish";
import { useExamAttemptHeartbeat } from "@/lib/use-exam-attempt-heartbeat";
import { isExamAttemptFinished } from "@/lib/student";

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
  } catch { /* blocked by browser / Android policy */ }
  // On native Capacitor WebView, StatusBar.hide is the real immersive control.
  // document.fullscreen may remain false — treat native immersive as success.
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
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState<number | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [fsGate, setFsGate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string>("");
  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [pauseRemainingSec, setPauseRemainingSec] = useState<number | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const lastTabHiddenAtRef = useRef(0);
  const orderedIdsRef = useRef<string[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraReconnectLockRef = useRef(false);
  const pauseUntilRef = useRef<number | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const pausedRef = useRef(false);
  const faceStatusForLiveRef = useRef<string>("ok");
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  pausedRef.current = paused;
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
        .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, pause_duration_seconds, total_marks, instructions, result_visibility, questions_to_answer")
        .eq("exam_id", id).maybeSingle();
      return data as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const exam = examQ.data!;
      return loadExamQuestionBank({
        courseId: String(exam.course_id),
        schoolId: exam.school_id ? String(exam.school_id) : null,
        examId: id || null,
      });
    },
  });

  const priorAttemptQ = useQuery({
    queryKey: ["cbt-prior-attempt", id, student?.studentId],
    enabled: Boolean(id && student?.studentId && !previewMode),
    queryFn: async () => {
      const { data: attempt } = await supabase
        .from("exam_attempts")
        .select("id, status")
        .eq("exam_id", id)
        .eq("student_id", student!.studentId)
        .maybeSingle();
      const { data: result } = await supabase
        .from("results")
        .select("id")
        .eq("exam_id", id)
        .eq("student_id", student!.studentId)
        .maybeSingle();
      return {
        attemptStatus: (attempt?.status as string | undefined) ?? null,
        hasResult: Boolean(result?.id),
        attemptId: (attempt?.id as string | undefined) ?? null,
      };
    },
  });

  const alreadyFinished = !previewMode && isExamAttemptFinished(
    priorAttemptQ.data?.attemptStatus,
    priorAttemptQ.data?.hasResult,
  );

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);

  const shutdownMedia = useCallback(() => {
    holdExamScreenShare(false);
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);

  const reconnectCamera = useCallback(async () => {
    if (!security.requireCamera || cameraReconnectLockRef.current || doneRef.current || finishingRef.current) return;
    const cur = mediaStreamRef.current;
    const live = cur?.getVideoTracks().some((tr) => tr.readyState === "live" && tr.enabled !== false);
    if (live) return;
    cameraReconnectLockRef.current = true;
    try {
      const stream = await openCameraStream({ facingMode: "user", audio: Boolean(security.requireMicrophone) });
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = stream;
      setLiveStream(stream);
    } catch (e) {
      console.warn("[cbt] camera reconnect failed", e);
    } finally {
      cameraReconnectLockRef.current = false;
    }
  }, [security.requireCamera, security.requireMicrophone]);

  const clearTimedPause = useCallback(() => {
    pauseUntilRef.current = null;
    setPauseRemainingSec(null);
    setPaused(false);
    setPauseReason("");
    void reconnectCamera();
  }, [reconnectCamera]);

  const beginTimedPause = useCallback((reason: string) => {
    const secs = Math.max(5, Number(security.pauseDurationSeconds) || 300);
    pauseUntilRef.current = Date.now() + secs * 1000;
    setPauseRemainingSec(secs);
    setPauseReason(reason);
    setPaused(true);
  }, [security.pauseDurationSeconds]);

  useEffect(() => {
    if (!paused || pauseUntilRef.current == null) return;
    const tick = () => {
      const until = pauseUntilRef.current;
      if (until == null) return;
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setPauseRemainingSec(left);
      if (left <= 0) clearTimedPause();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [paused, clearTimedPause]);

  useEffect(() => {
    // Timer keeps running during integrity pause — time loss is the consequence
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
      void leaveExamFullscreen();
    }
  }, [done, shutdownMedia]);

  useEffect(() => () => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    void exitExamImmersive();
  }, []);

  useLiveCamPublish({
    enabled: started && !done && !previewMode && Boolean(security.requireCamera),
    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,
    studentId: student?.studentId,
    examId: id,
    attemptId: liveAttemptId || attemptIdRef.current,
    stream: liveStream,
    getStream: () => mediaStreamRef.current || liveStream,
    getFaceStatus: () => faceStatusForLiveRef.current,
    getAnsweredCount: () => Object.keys(answers).length,
    getTotalQuestions: () => questions.length,
    getTimeRemainingSec: () => seconds,
    getStudentName: () => String((student as { fullName?: string } | null)?.fullName || session?.fullName || session?.identifier || "").trim() || null,
    getMatricNumber: () => String((student as { matric?: string | null; matricNumber?: string | null } | null)?.matric || (student as { matricNumber?: string | null } | null)?.matricNumber || session?.identifier || "").trim() || null,
    getCourseCode: () => {
      const c = (examQ.data as { courses?: { code?: string } | { code?: string }[] } | null)?.courses;
      if (Array.isArray(c)) return String(c[0]?.code || "").trim() || null;
      return String((c as { code?: string } | undefined)?.code || "").trim() || null;
    },
    getExamTitle: () => String(examQ.data?.title || "").trim() || null,
    getTabSwitchCount: () => tabSwitchCountRef.current,
  });
  useLiveScreenPublish({
    enabled: started && !done && !previewMode && Boolean(screenStream),
    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,
    studentId: student?.studentId,
    examId: id,
    attemptId: liveAttemptId || attemptIdRef.current,
    stream: screenStream,
    getStream: () => screenStreamRef.current || screenStream,
  });

  useExamAttemptHeartbeat({
    enabled: started && !done && !previewMode,
    attemptId: liveAttemptId || attemptIdRef.current,
  });

  useEffect(() => {
    if (!started || done || previewMode) return;
    const studentId = student?.studentId;
    if (!studentId) return;
    const ch = supabase.channel(`student-exam-warn:${studentId}`);
    ch.on("broadcast", { event: "officer_warning" }, ({ payload }) => {
      const p = payload as { message?: string; examId?: string };
      if (p?.examId && id && String(p.examId) !== String(id)) return;
      if (doneRef.current) return;
      const msg = p?.message || "Warning from examination officer";
      setWarnBanner(msg);
      try { haptic("officer_warning"); } catch { /* ignore */ }
      window.setTimeout(() => setWarnBanner(null), 10000);
    });
    void ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [started, done, previewMode, student?.studentId, id]);

  useEffect(() => {
    if (!started || done || previewMode) return;
    const studentId = student?.studentId;
    if (!studentId) return;
    const ch = supabase.channel(`student-exam-cmd:${studentId}`);
    ch.on("broadcast", { event: "officer_command" }, ({ payload }) => {
      const p = payload as { command?: string; examId?: string; attemptId?: string };
      if (!p?.command) return;
      if (p.examId && id && String(p.examId) !== String(id)) return;
      if (doneRef.current || finishingRef.current) return;
      const cmd = String(p.command).toLowerCase();
      if (cmd === "hold" || cmd === "pause") {
        // Officer pause: indefinite until release (not timed integrity pause)
        pauseUntilRef.current = null;
        setPauseRemainingSec(null);
        setPauseReason("Paused by examination officer");
        setPaused(true);
        setWarnBanner("Your examination has been paused by the officer");
        window.setTimeout(() => setWarnBanner(null), 10000);
      } else if (cmd === "release" || cmd === "resume") {
        pauseUntilRef.current = null;
        setPauseRemainingSec(null);
        setPaused(false);
        setPauseReason("");
        setWarnBanner("Your examination has been released by the officer");
        window.setTimeout(() => setWarnBanner(null), 6000);
        void reconnectCamera();
      } else if (cmd === "terminate") {
        setDoneTerminated(true);
        void finishAttempt(true);
      } else if (cmd === "submit") {
        void finishAttempt(false);
      }
    });
    void ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, previewMode, student?.studentId, id]);

  // Integrity: fullscreen exit + app background / tab switch
  useEffect(() => {
    if (!started || done || previewMode || paused) return;
    const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId ?? "");
    const studentId = student?.studentId;
    if (!schoolId || !studentId || !id) return;

    const DEBOUNCE_MS = 2500;

    const applyConsequence = async (eventType: string, description: string) => {
      const now = Date.now();
      if (now - lastViolationAtRef.current < DEBOUNCE_MS) return;
      lastViolationAtRef.current = now;

      const action = security.thresholdAction || "flag";
      void logSecurityEvent({
        schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
        eventType, severity: action === "terminate" ? "high" : "medium",
        description, questionIndex: index,
        extra: {
          tab_switch_count: tabSwitchCountRef.current,
          fullscreen_exit_count: fullscreenExitCountRef.current,
          threshold_action: action,
        },
      });

      if (action === "warn" || action === "flag") {
        setWarnBanner(description);
        try { haptic("tab_switch"); } catch { /* ignore */ }
        window.setTimeout(() => setWarnBanner(null), 6000);
      } else if (action === "pause") {
        beginTimedPause(description);
      } else if (action === "terminate") {
        setDoneTerminated(true);
        await finishAttempt(true);
      }
    };

    const onFsChange = () => {
      if (finishingRef.current || doneRef.current) return;
      if (!security.fullscreen) return;
      if (document.fullscreenElement) {
        setFsGate(false);
        return;
      }
      // On native we rely on StatusBar immersive; document fullscreen may be unavailable.
      // Still record exit when browser fullscreen was previously active.
      fullscreenExitCountRef.current += 1;
      setFsGate(true);
      void applyConsequence("FULLSCREEN_EXIT", "Fullscreen was exited during the examination.");
      if (attemptIdRef.current) {
        void supabase.from("exam_attempts").update({
          fullscreen_exit_count: fullscreenExitCountRef.current,
        } as never).eq("id", attemptIdRef.current);
      }
    };

    const onVis = () => {
      if (!security.tabMonitoring) return;
      if (document.visibilityState === "visible") {
        void reconnectCamera();
        return;
      }
      if (document.visibilityState !== "hidden") return;
      const now = Date.now();
      if (now - lastTabHiddenAtRef.current < 800) return;
      lastTabHiddenAtRef.current = now;
      tabSwitchCountRef.current += 1;
      setTabSwitchCount(tabSwitchCountRef.current);
      if (attemptIdRef.current) {
        void (async () => {
          try {
            const aid = attemptIdRef.current!;
            const { data: prevRow } = await supabase.from("exam_attempts").select("metadata").eq("id", aid).maybeSingle();
            const prevMeta = prevRow?.metadata && typeof prevRow.metadata === "object" && !Array.isArray(prevRow.metadata)
              ? (prevRow.metadata as Record<string, unknown>)
              : {};
            await supabase.from("exam_attempts").update({
              tab_switch_count: tabSwitchCountRef.current,
              metadata: {
                ...prevMeta,
                tabSwitchCount: tabSwitchCountRef.current,
                lastSeenAt: new Date().toISOString(),
                studentName: String((student as { fullName?: string } | null)?.fullName || session?.fullName || prevMeta.studentName || "").trim() || prevMeta.studentName,
                matricNumber: String((student as { matric?: string | null } | null)?.matric || session?.identifier || prevMeta.matricNumber || "").trim() || prevMeta.matricNumber,
              },
              updated_at: new Date().toISOString(),
            } as never).eq("id", aid);
          } catch (e) {
            console.warn("[cbt] tab_switch persist", e);
          }
        })();
      }
      const max = security.maxTabSwitches ?? 5;
      if (tabSwitchCountRef.current >= max) {
        void applyConsequence("TAB_SWITCH", `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`);
      } else {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_SWITCH", severity: "low",
          description: `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`,
          questionIndex: index,
        });
        setWarnBanner(`Stay on the exam screen. Switches: ${tabSwitchCountRef.current}/${max}`);
        window.setTimeout(() => setWarnBanner(null), 4000);
      }
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVis);
    };
    // finishAttempt is stable enough via refs for this monitoring effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, previewMode, paused, security.fullscreen, security.tabMonitoring, security.maxTabSwitches, security.thresholdAction, id, index, examQ.data?.school_id, student?.studentId, student?.schoolId, session?.schoolId]);

  const questionsToAnswer = useMemo(() => {
    const row = (settingsQ.data as { questions_to_answer?: number } | null)?.questions_to_answer;
    if (typeof row === "number" && row > 0) return Math.floor(row);
    const meta = parseExamMeta(examQ.data?.description);
    return meta.questionsToAnswer && meta.questionsToAnswer > 0 ? meta.questionsToAnswer : null;
  }, [settingsQ.data, examQ.data?.description]);

  const questions = useMemo(() => {
    const key = student?.studentId ?? (previewMode ? "officer-preview" : session?.userId ?? "anon");
    const paper = prepareStudentPaper((questionsQ.data ?? []) as never, {
      questionsToAnswer,
      randomizeQuestions: Boolean(security.randomizeQuestions),
      randomizeOptions: Boolean(security.randomizeOptions),
      studentKey: key,
      examId: id,
    });
    // Prefer locked order from attempt (stable across refresh)
    const locked = orderedIdsRef.current;
    if (locked && locked.length) {
      const byId = new Map(paper.map((q) => [q.id, q]));
      const ordered = locked.map((qid) => byId.get(qid)).filter(Boolean) as typeof paper;
      if (ordered.length) return ordered;
    }
    return paper;
  }, [questionsQ.data, questionsToAnswer, security.randomizeQuestions, security.randomizeOptions, student?.studentId, session?.userId, previewMode, id]);

  const TOTAL = questions.length;
  const q = questions[index];
  const answeredCount = Object.keys(answers).length;

  const faceWarnCountRef = useRef(0);
  const onFaceSecurityEvent = useCallback((ev: FaceSecurityEvent) => {
    faceStatusForLiveRef.current = ev.kind === "ok" ? "ok" : ev.kind;
    if (previewMode || doneRef.current) return;
    const mapped = mapFaceSecurityEvent(ev.kind, ev.faceCount);
    const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId ?? "");
    const studentId = student?.studentId;
    if (!schoolId || !studentId || !id) return;
    const isViolation = ev.kind === "none" || ev.kind === "multi" || ev.kind === "camera_blocked";
    if (isViolation) faceWarnCountRef.current += 1;
    void logSecurityEvent({
      schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
      eventType: mapped.eventType, severity: mapped.severity, description: mapped.description,
      extra: { faceCount: ev.faceCount, source: "ExamCameraPip", warnCount: faceWarnCountRef.current },
    });
    const maxW = security.maxFaceWarnings ?? 5;
    const action = security.faceViolationAction || security.thresholdAction || "flag";
    if (!isViolation) return;
    if (faceWarnCountRef.current < maxW) {
      setWarnBanner(mapped.description || "Face integrity warning");
      window.setTimeout(() => setWarnBanner(null), 5000);
      return;
    }
    if (action === "warn" || action === "flag") {
      setWarnBanner(mapped.description || "Face integrity threshold reached");
      window.setTimeout(() => setWarnBanner(null), 6000);
    } else if (action === "pause") {
      beginTimedPause(mapped.description || "Face integrity violation");
    } else if (action === "terminate") {
      setDoneTerminated(true);
      void finishAttempt(true);
    }
  }, [previewMode, examQ.data?.school_id, student?.studentId, student?.schoolId, session?.schoolId, id, security.maxFaceWarnings, security.faceViolationAction, security.thresholdAction]);

  async function requestSubmit() {
    if (done || finishingRef.current || previewMode) return;
    const unanswered = Math.max(0, TOTAL - answeredCount);
    const msg = unanswered > 0
      ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit this examination anyway?`
      : "Submit this examination now?";
    if (!window.confirm(msg)) return;
    await finishAttempt(false);
  }

  async function finishAttempt(auto = false) {
    if (done || finishingRef.current) return;
    finishingRef.current = true;
    doneRef.current = true;
    setFsGate(false);
    setPaused(false);
    shutdownMedia();
    void leaveExamFullscreen();
    if (previewMode) {
      toast.message("Preview ended — nothing was saved");
      setDone(true);
      finishingRef.current = false;
      return;
    }
    try {
      if (student?.studentId && examQ.data) {
        let attemptId = attemptIdRef.current;
        if (!attemptId) {
          const { data } = await supabase.from("exam_attempts").upsert({
            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,
            status: "in_progress", started_at: new Date().toISOString(), answers,
          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();
          attemptId = (data?.id as string) ?? null;
          attemptIdRef.current = attemptId;
        }
        const schoolId = String(examQ.data.school_id ?? student.schoolId ?? "");
        const saved = await saveCbtResult({
          examId: id, studentId: student.studentId, schoolId, attemptId,
          questions: questions.map((qq) => ({
            id: qq.id, marks: qq.marks ?? 1, correct_answer: qq.correct_answer,
            options: qq.options ?? [],
            originalOptions: (qq as { originalOptions?: string[] }).originalOptions ?? [],
            correctOptionText: (qq as { correctOptionText?: string | null }).correctOptionText ?? null,
          })),
          answers, terminated: auto, resultVisibility: security.resultVisibility,
        });
        if (saved.error) toast.error(saved.error.message);
        else {
          let rid = saved.resultId ?? null;
          if (!rid) {
            const { data: res } = await supabase.from("results").select("id").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
            rid = (res?.id as string) ?? null;
          }
          if (rid) { setResultId(rid); resultIdRef.current = rid; }
          toast.success(saved.published ? "Examination submitted — result is available now" : "Examination submitted successfully");
        }
        await qc.invalidateQueries({ queryKey: ["student-exams"] });
      } else toast.success(auto ? "Examination closed" : "Examination submitted successfully");
    } catch (e) { toast.error(friendlyError(e, "Could not save result")); }
    setDoneTerminated(auto);
    setDone(true);
    shutdownMedia();
    finishingRef.current = false;
  }

  async function beginWithMedia(_opts: { skipScreenShare: boolean; caps: DeviceCapabilities }) {
    setMediaBusy(true);
    try {
      if (!previewMode && student?.studentId) {
        const { data: existing } = await supabase.from("exam_attempts").select("id, status").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
        if (existing && ["submitted", "terminated", "flagged"].includes(String(existing.status))) {
          toast.error("You have already completed this examination.");
          shutdownMedia(); setDone(true); return;
        }
        if (existing?.id) {
          attemptIdRef.current = existing.id as string;
          setLiveAttemptId(existing.id as string);
        }
      }
      const needCam = Boolean(security.requireCamera);
      const needMic = Boolean(security.requireMicrophone);
      if (needCam || needMic) {
        try {
          let stream: MediaStream;
          if (needCam) {
            stream = await openCameraStream({ facingMode: "user", audio: needMic });
          } else {
            const mic = await ensureMicrophonePermission();
            if (!mic.granted) throw new Error(mic.error || "Microphone required");
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          }
          stopMediaStream(mediaStreamRef.current);
          mediaStreamRef.current = stream;
          setLiveStream(stream);
          toast.success(needCam ? "Camera ready" : "Microphone ready");
        } catch {
          toast.error(needCam ? "Camera is required for this examination." : "Microphone is required for this examination.");
          return;
        }
      }
      const needScreen = Boolean(security.requireScreenShare) && !_opts.skipScreenShare;
      if (needScreen) {
        holdExamScreenShare(true);
        const share = await startScreenShareStream();
        if (!share.ok) {
          holdExamScreenShare(false);
          toast.error(share.message || "Screen sharing is required for this examination.");
          return;
        }
        // reuse keeps MediaProjection alive across Gate → CBT navigation
        screenStreamRef.current = share.stream;
        setScreenStream(share.stream);
        onScreenShareEnded(share.stream, () => {
          toast.error("Screen sharing stopped. Re-enable to continue the exam.");
          setPaused(true);
          setPauseReason("Screen sharing stopped");
          setScreenStream(null);
          screenStreamRef.current = null;
        });
        toast.success("Screen sharing active");
      }
      try { haptic("start"); } catch { /* ignore */ }
      if (security.fullscreen) {
        const ok = await requestExamFullscreen();
        if (!ok) { toast.message("Please allow fullscreen to continue the exam"); setFsGate(true); }
      }
      if (!previewMode && student?.studentId && examQ.data?.school_id) {
        // Load existing attempt for stable question set
        const { data: existingFull } = await supabase
          .from("exam_attempts")
          .select("id, status, question_order, tab_switch_count, fullscreen_exit_count, answers")
          .eq("exam_id", id)
          .eq("student_id", student.studentId)
          .maybeSingle();
        if (existingFull?.id) {
          attemptIdRef.current = existingFull.id as string;
          setLiveAttemptId(existingFull.id as string);
          tabSwitchCountRef.current = Number(existingFull.tab_switch_count ?? 0);
          fullscreenExitCountRef.current = Number(existingFull.fullscreen_exit_count ?? 0);
          const qo = existingFull.question_order;
          if (Array.isArray(qo) && qo.length) {
            orderedIdsRef.current = qo.map(String);
          }
          if (existingFull.answers && typeof existingFull.answers === "object") {
            setAnswers(existingFull.answers as Record<string, number>);
          }
        }
        // Build paper now so we can lock order
        const key = student.studentId;
        const paper = prepareStudentPaper((questionsQ.data ?? []) as never, {
          questionsToAnswer,
          randomizeQuestions: Boolean(security.randomizeQuestions),
          randomizeOptions: Boolean(security.randomizeOptions),
          studentKey: key,
          examId: id,
        });
        const orderIds = orderedIdsRef.current?.length
          ? orderedIdsRef.current
          : paper.map((q) => q.id);
        orderedIdsRef.current = orderIds;

        if (!attemptIdRef.current) {
          const studentName = String((student as { fullName?: string } | null)?.fullName || session?.fullName || "").trim() || undefined;
          const { data } = await supabase.from("exam_attempts").upsert({
            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,
            status: "in_progress", started_at: new Date().toISOString(), answers: {},
            question_order: orderIds,
            metadata: { studentName: studentName || session?.fullName || undefined, matricNumber: String((student as { matricNumber?: string } | null)?.matricNumber || (student as { matric?: string } | null)?.matric || session?.identifier || "").trim() || undefined, courseCode: (Array.isArray((examQ.data as unknown as { courses?: { code?: string }[] } | null)?.courses) ? String((examQ.data as unknown as { courses: { code?: string }[] }).courses[0]?.code || "").trim() : String((examQ.data as unknown as { courses?: { code?: string } } | null)?.courses?.code || "").trim()) || undefined, examTitle: String(examQ.data?.title || "").trim() || undefined, lastSeenAt: new Date().toISOString() },
          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();
          if (data?.id) { attemptIdRef.current = data.id as string; setLiveAttemptId(data.id as string); }
        } else {
          // Persist order if missing
          const studentNameUpd = String((student as { fullName?: string } | null)?.fullName || session?.fullName || "").trim() || undefined;
          const matricUpd = String((student as { matric?: string | null } | null)?.matric || "").trim() || undefined;
          void (async () => {
            try {
              const { data: prevRow } = await supabase.from("exam_attempts").select("metadata").eq("id", attemptIdRef.current!).maybeSingle();
              const prevMeta = prevRow?.metadata && typeof prevRow.metadata === "object" && !Array.isArray(prevRow.metadata) ? (prevRow.metadata as Record<string, unknown>) : {};
              await supabase.from("exam_attempts").update({
                question_order: orderIds,
                status: "in_progress",
                metadata: { ...prevMeta, studentName: studentNameUpd || prevMeta.studentName, matricNumber: matricUpd || prevMeta.matricNumber, courseCode: (Array.isArray((examQ.data as unknown as { courses?: { code?: string }[] } | null)?.courses) ? String((examQ.data as unknown as { courses: { code?: string }[] }).courses[0]?.code || prevMeta.courseCode || "").trim() : String((examQ.data as unknown as { courses?: { code?: string } } | null)?.courses?.code || prevMeta.courseCode || "").trim()) || prevMeta.courseCode, examTitle: String(examQ.data?.title || prevMeta.examTitle || "").trim() || prevMeta.examTitle, lastSeenAt: new Date().toISOString() },
              } as never).eq("id", attemptIdRef.current!);
            } catch (e) { console.warn("[cbt] metadata merge", e); }
          })();
        }
      }
      setSeconds((examQ.data?.duration_minutes ?? 60) * 60);
      setStarted(true);
      setIndex(0);
    } finally { setMediaBusy(false); }
  }

  async function restoreFullscreenFromUser() {
    const ok = await requestExamFullscreen();
    if (ok) { setFsGate(false); setPaused(false); toast.success("Fullscreen restored"); }
    else toast.error("Could not enter fullscreen. Tap again or check device permissions.");
  }

  async function goToResult() {
    shutdownMedia();
    let targetId = resultIdRef.current || resultId;
    if (student?.studentId && !targetId) {
      const { data: res } = await supabase.from("results").select("id").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
      targetId = (res?.id as string) ?? null;
    }
    void navigate({ to: "/student/results/$id", params: { id: targetId || id } });
  }

  if (examQ.isLoading || questionsQ.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading examination…</p>
      </div>
    );
  }
  const exam = examQ.data;
  if (!exam) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="font-bold">Examination not found</p>
        <Button className="mt-4" asChild><Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>Back</Link></Button>
      </div>
    );
  }
  if (done) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? session?.schoolName} size="lg" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{previewMode ? "Preview ended" : "Examination completed"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode ? "Officer preview finished." : doneTerminated ? "Your attempt was closed." : "Your answers were submitted successfully."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {!previewMode && (<Button className="font-semibold" onClick={() => void goToResult()}>View Results</Button>)}
            <Button variant="outline" className="font-semibold" asChild>
              <Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>{previewMode ? "Back" : "Back to examinations"}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (alreadyFinished) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-white p-6 text-center shadow-sm">
          <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? session?.schoolName} size="lg" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">Examination already completed</h1>
          <p className="mt-2 text-sm text-slate-600">
            You have already submitted or finished this examination. Retakes are not allowed.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="font-semibold" onClick={() => void goToResult()}>View Results</Button>
            <Button variant="outline" className="font-semibold" asChild>
              <Link to="/student/examinations">Back to examinations</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!started) {
    return (
      <ExamSecurityGate
        examTitle={previewMode ? `${exam.title} (Officer preview)` : exam.title}
        courseLine={`${(exam as { courses?: { code?: string; name?: string } }).courses?.code ?? ""} · ${(exam as { courses?: { code?: string; name?: string } }).courses?.name ?? ""}`}
        durationMinutes={exam.duration_minutes ?? 60}
        totalQuestions={TOTAL}
        security={security}
        busy={mediaBusy}
        schoolLogoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl}
        schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName}
        windowLabel={previewMode ? "Officer interactive preview" : formatExamWindow(exam.scheduled_start, exam.scheduled_end)}
        cancelTo={previewMode ? "/officer/approvals" : "/student/examinations"}
        onStart={(opts) => void beginWithMedia(opts)}
      />
    );
  }
  if (TOTAL === 0) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="font-bold">No active questions for this course</p>
        <Button className="mt-4" asChild><Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>Back</Link></Button>
      </div>
    );
  }
  const mm = String(Math.floor((seconds ?? 0) / 60)).padStart(2, "0");
  const ss = String((seconds ?? 0) % 60).padStart(2, "0");
  return (
    <div className="d4-cbt-exam relative flex h-dvh flex-col overflow-hidden bg-slate-50 select-none">
      {previewMode && (
        <div className="shrink-0 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">
          OFFICER PREVIEW — answers are not saved
        </div>
      )}
      <header className="d4-cbt-header z-40 shrink-0 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName} size="md" className="bg-transparent" />
            <p className="hidden truncate text-sm font-bold sm:block">{(exam as { courses?: { code?: string } }).courses?.code ?? "EXAM"} — {exam.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm font-bold tabular-nums">{mm}:{ss}</div>
            <Button size="sm" variant="secondary" className="font-semibold" onClick={() => void requestSubmit()}>Submit</Button>
          </div>
        </div>
      </header>
            <main className="d4-cbt-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-4 p-3 pb-8 sm:p-6 lg:grid-cols-[220px_1fr]">
        <aside className="order-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:order-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Questions</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {questions.map((qq, i) => {
              const answered = answers[qq.id] != null;
              const isFlag = flagged.has(qq.id);
              const isCurrent = i === index;
              return (
                <button key={qq.id} type="button" onClick={() => setIndex(i)}
                  className={cn("grid h-9 place-items-center rounded-md text-xs font-bold transition",
                    isCurrent && "bg-primary text-white ring-2 ring-primary/30",
                    !isCurrent && answered && "bg-emerald-500 text-white",
                    !isCurrent && isFlag && !answered && "bg-amber-400 text-slate-900",
                    !isCurrent && !answered && !isFlag && "border border-slate-200 bg-white text-slate-700 hover:border-primary")}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">Answered <span className="font-bold text-slate-800">{answeredCount}</span> / {TOTAL}</p>
        </aside>
        <section className="order-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-primary">Question <span className="text-primary">{index + 1}</span> of {TOTAL}</p>
            <button type="button" onClick={() => {
              if (!q) return;
              setFlagged((prev) => { const next = new Set(prev); if (next.has(q.id)) next.delete(q.id); else next.add(q.id); return next; });
            }} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
              q && flagged.has(q.id) ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600")}>
              <Flag className="h-3.5 w-3.5" />{q && flagged.has(q.id) ? "Marked" : "Mark for Review"}
            </button>
          </div>
          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q?.question_text}</h1>
          <ul className="mt-6 space-y-3">
            {(q?.options ?? []).map((opt, oi) => {
              const selected = q ? answers[q.id] === oi : false;
              return (
                <li key={oi}>
                  <button type="button" onClick={() => {
                    if (q) setAnswers((a) => ({ ...a, [q.id]: oi }));
                  }}
                    className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition",
                      selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/40")}>
                    <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold",
                      selected ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-500")}>{String.fromCharCode(65 + oi)}</span>
                    <span>{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <Button variant="outline" className="rounded-lg font-semibold" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button className="rounded-lg font-semibold" disabled={index >= TOTAL - 1} onClick={() => setIndex((i) => Math.min(TOTAL - 1, i + 1))}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
      </main>
      {started && !done && security.tabMonitoring && (
        <div className="pointer-events-none fixed bottom-3 right-3 z-[120] sm:bottom-4 sm:right-4">
          <div className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
            Tab violations: {tabSwitchCount}/{Math.max(1, Number(security.maxTabSwitches) || 5)}
          </div>
        </div>
      )}
      {started && !done && security.requireCamera && (
        <ExamCameraPip
          enabled={started && !done}
          faceDetection={Boolean(security.faceDetection || security.requireCamera)}
          maxFaceWarnings={security.maxFaceWarnings ?? 3}
          stream={liveStream}
          onSecurityEvent={onFaceSecurityEvent}
          onNeedReconnect={() => { void reconnectCamera(); }}
        />
      )}
      {warnBanner && started && !done && (
        <div className="fixed inset-x-0 top-16 z-[150] flex justify-center px-3 pointer-events-none">
          <div className="max-w-md rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900 shadow-lg">
            Exam Integrity Warning — {warnBanner}
          </div>
        </div>
      )}
      {paused && started && !done && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-white p-6 text-center shadow-2xl">
            <h2 className="text-lg font-extrabold text-slate-900">EXAM PAUSED</h2>
            <p className="mt-2 text-sm text-slate-600">
              Your examination has been paused because an integrity violation was detected.
            </p>
            {pauseReason ? <p className="mt-3 text-xs font-semibold text-slate-800">Reason: {pauseReason}</p> : null}
            {pauseRemainingSec != null && pauseRemainingSec > 0 ? (
              <>
                <p className="mt-4 font-mono text-3xl font-extrabold tabular-nums text-primary">
                  {String(Math.floor(pauseRemainingSec / 60)).padStart(2, "0")}:{String(pauseRemainingSec % 60).padStart(2, "0")}
                </p>
                <p className="mt-1 text-xs text-slate-500">Resumes automatically when the timer reaches zero</p>
              </>
            ) : (
              <Button className="mt-5 w-full font-semibold" onClick={() => void clearTimedPause()}>
                Resume examination
              </Button>
            )}
          </div>
        </div>
      )}
      {fsGate && security.fullscreen && started && !done && !paused && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary"><Maximize className="h-6 w-6" /></div>
            <h2 className="text-lg font-extrabold text-slate-900">Fullscreen required</h2>
            <p className="mt-2 text-sm text-slate-600">Tap below to continue in fullscreen.</p>
            <Button className="mt-5 w-full font-semibold" onClick={() => void restoreFullscreenFromUser()}>
              <Maximize className="mr-2 h-4 w-4" /> Return to fullscreen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
