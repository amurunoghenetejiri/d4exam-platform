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
import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream } from "@/lib/screen-share";
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
    enabled: started && !done && !previewMode && !paused && Boolean(screenStream),
    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,
    studentId: student?.studentId,
    examId: id,
    attemptId: liveAttemptId || attemptIdRef.current,
    stream: screenStream,
    getStream: () => screenStreamRef.current || screenStream,
  });

  useEffect(() => {
    if (!started || done || previewMode) return;
    const tick = () => {
      const aid = attemptIdRef.current;
      if (!aid) return;
      const meta = {
        lastSeenAt: new Date().toISOString(),
        cameraActive: Boolean(mediaStreamRef.current || liveStream),
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
    const t = window.setInterval(tick, 8000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, previewMode, liveStream, session?.fullName, student?.fullName]);

  const shutdownMedia = useCallback(() => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try {
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

    // 1) Broadcast channel — immediate, no RLS dependency
    const broadcastCh = supabase
      .channel(`student-exam-warn:${studentId}`)
      .on("broadcast", { event: "officer_warning" }, ({ payload }) => {
        try {
          const p = (payload || {}) as {
            examId?: string;
            studentId?: string;
            message?: string;
          };
          if (p.studentId && String(p.studentId) !== String(studentId)) return;
          if (p.examId && String(p.examId) !== String(id)) return;
          showWarn(p.message);
        } catch {
          /* ignore */
        }
      })
      .subscribe();

    // 2) postgres integrity_events (backup if RLS allows)
    const pgCh = supabase
      .channel(`exam-officer-warn-${id}-${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "integrity_events",
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          try {
            const row = payload.new as {
              event_type?: string;
              description?: string;
              exam_id?: string | null;
            };
            const et = String(row.event_type || "").toUpperCase();
            if (et !== "WARNING_SHOWN" && et !== "OFFICER_WARNING") return;
            if (row.exam_id && String(row.exam_id) !== String(id)) return;
            showWarn(row.description);
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(broadcastCh);
      void supabase.removeChannel(pgCh);
    };
  }, [started, done, previewMode, student?.studentId, id]);



  useEffect(() => () => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    void exitExamImmersive();
  }, []);

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
      } else if (action === "terminate") {
        setDoneTerminated(true);
        await finishAttempt(true);
      }
    };
    const onFsChange = () => {
      if (!security.fullscreen) return;
      if (finishingRef.current || done) return;
      if (document.fullscreenElement) { setFsGate(false); return; }
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
      if (document.visibilityState !== "hidden") return;
      tabSwitchCountRef.current += 1;
      if (attemptIdRef.current) {
        void supabase.from("exam_attempts").update({
          tab_switch_count: tabSwitchCountRef.current,
        } as never).eq("id", attemptIdRef.current);
      }
      const max = Math.max(1, Number(security.maxTabSwitches) || 5);
      const count = tabSwitchCountRef.current;
      void logSecurityEvent({
        schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
        eventType: "TAB_VIOLATION", severity: count >= max ? "high" : "low",
        description: `Tab violation ${count}/${max}.`,
        questionIndex: index,
        extra: { tab_switch_count: count, max_tab_switches: max, threshold_action: security.thresholdAction },
      });
      setWarnBanner(`Tab Violation: ${count}/${max}`);
      window.setTimeout(() => setWarnBanner(null), 4500);
      if (count < max) return;
      const action = security.thresholdAction || "flag";
      if (action === "warn") {
        setWarnBanner("EXAMINATION WARNING — You exceeded the configured tab-violation threshold.");
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_WARNING", severity: "medium",
          description: "Tab violation threshold reached (warning only).",
          questionIndex: index,
        });
        return;
      }
      if (action === "flag") {
        setWarnBanner("Your examination has been flagged for review because of repeated tab violations.");
        if (attemptIdRef.current) {
          void supabase.from("exam_attempts").update({ status: "flagged" } as never).eq("id", attemptIdRef.current);
        }
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_FLAGGED", severity: "high",
          description: "Tab violation threshold — flagged for review.",
          questionIndex: index,
        });
        return;
      }
      if (action === "pause") {
        const secs = Math.max(30, Number((security as { pauseDurationSeconds?: number }).pauseDurationSeconds) || 300);
        const ends = new Date(Date.now() + secs * 1000).toISOString();
        try { sessionStorage.setItem(`d4-pause-end-${id}`, ends); } catch { /* */ }
        if (attemptIdRef.current) {
          void supabase.from("exam_attempts").update({ status: "paused" } as never).eq("id", attemptIdRef.current);
        }
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_PAUSE", severity: "high",
          description: `Tab violation threshold — paused ${secs}s.`,
          questionIndex: index,
          extra: { pause_ends_at: ends, pause_seconds: secs },
        });
        setPauseReason(`You exceeded the permitted number of tab violations (${count}/${max}).`);
        setPaused(true);
        return;
      }
      if (action === "auto_submit") {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_AUTO_SUBMIT", severity: "high",
          description: "Tab violation threshold — auto-submitted.",
          questionIndex: index,
        });
        setTerminationReason("Your examination was automatically submitted because you exceeded the permitted number of tab violations.");
        setDoneTerminated(true);
        void finishAttempt(true);
        return;
      }
      void logSecurityEvent({
        schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
        eventType: "TAB_TERMINATION", severity: "high",
        description: "Tab violation threshold — terminated.",
        questionIndex: index,
      });
      setTerminationReason("Your examination was terminated because you exceeded the permitted number of tab violations.");
      setDoneTerminated(true);
      void finishAttempt(true);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVis);
    };
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
  answeredCountRef.current = answeredCount;
  totalQuestionsRef.current = questions.length;
  timeRemainingRef.current = seconds;

  const faceWarnCountRef = useRef(0);
  const onFaceSecurityEvent = useCallback((ev: FaceSecurityEvent) => {
    faceStatusRef.current = ev.kind === "ok" ? "ok" : ev.kind === "multi" ? "multi" : ev.kind === "none" ? "none" : String(ev.kind);
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
    // Face issues: top banner only (no small toasts). Strong actions reserved for TAB VIOLATION.
    setWarnBanner(mapped.description || "Face integrity warning");
    window.setTimeout(() => setWarnBanner(null), 5000);
    if (faceWarnCountRef.current < maxW) return;
    if (action === "flag") {
      setWarnBanner("Your examination has been flagged for review (face integrity).");
      window.setTimeout(() => setWarnBanner(null), 6000);
    }
    // Do not pause/terminate solely from face here — TAB VIOLATION owns those consequences.

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
    shutdownMedia();
    setFsGate(false);
    setPaused(false);
    setWarnBanner(null);
    setDoneTerminated(auto);
    setDone(true);
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
          if (attemptId) setLiveAttemptId(attemptId);
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
          try {
            const examTitle = String(examQ.data?.title || "your examination");
            const schoolId = String(examQ.data?.school_id ?? student.schoolId ?? session?.schoolId ?? "") || null;
            const authUid = session?.userId || "";
            if (auto) {
              const reason = (terminationReason || "").toLowerCase();
              if (
                reason.includes("auto") ||
                reason.includes("automatically submitted") ||
                reason.includes("tab violation")
              ) {
                void notifyStudentExamAutoSubmitted({
                  studentUserId: authUid || undefined,
                  studentId: student.studentId,
                  schoolId,
                  examId: id,
                  examTitle,
                });
              } else {
                void notifyStudentExamTerminated({
                  studentUserId: authUid || undefined,
                  studentId: student.studentId,
                  schoolId,
                  examId: id,
                  examTitle,
                  reason: terminationReason || null,
                });
              }
            } else if (authUid) {
              void notifyStudentExamSubmitted({
                studentUserId: authUid,
                schoolId,
                examId: id,
                examTitle,
              });
            }
          } catch {
            /* non-blocking */
          }
        }
        await qc.invalidateQueries({ queryKey: ["student-exams"] });
      } else toast.success(auto ? "Examination closed" : "Examination submitted successfully");
    } catch (e) { toast.error(friendlyError(e, "Could not save result")); }
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
        if (existing?.id) { attemptIdRef.current = existing.id as string; setLiveAttemptId(existing.id as string); }
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
      // Screen share when teacher enabled and device supports it
      if (!_opts.skipScreenShare) {
        try {
          const share = await startScreenShareStream();
          if (share.ok) {
            stopScreenShareStream(screenStreamRef.current);
            screenStreamRef.current = share.stream;
            setScreenStream(share.stream);
            onScreenShareEnded(share.stream, () => {
              toast.error("Screen sharing stopped. Re-enable to continue the exam.");
              setPaused(true);
              setScreenStream(null);
              screenStreamRef.current = null;
            });
            toast.success("Screen sharing active");
          } else if (share.reason === "denied") {
            toast.error(share.message || "Screen share is required. Allow sharing to continue.");
            return;
          } else if (share.reason !== "unsupported") {
            toast.message(share.message || "Screen share unavailable on this device");
          }
        } catch (e) {
          console.warn("[cbt] screen share", e);
        }
      }
      // Always immersive during active CBT: hide phone status + system chrome.
      {
        const ok = await requestExamFullscreen();
        if (security.fullscreen && !ok) {
          toast.message("Please allow fullscreen to continue the exam");
          setFsGate(true);
        }
      }
      if (!previewMode && student?.studentId && examQ.data?.school_id) {
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
          if (Array.isArray(qo) && qo.length) orderedIdsRef.current = qo.map(String);
          if (existingFull.answers && typeof existingFull.answers === "object") {
            setAnswers(existingFull.answers as Record<string, number>);
          }
        }
        const key = student.studentId;
        const paper = prepareStudentPaper((questionsQ.data ?? []) as never, {
          questionsToAnswer,
          randomizeQuestions: Boolean(security.randomizeQuestions),
          randomizeOptions: Boolean(security.randomizeOptions),
          studentKey: key,
          examId: id,
        });
        const orderIds = orderedIdsRef.current?.length ? orderedIdsRef.current : paper.map((qq) => qq.id);
        orderedIdsRef.current = orderIds;
        if (!attemptIdRef.current) {
          const { data } = await supabase.from("exam_attempts").upsert({
            exam_id: id, student_id: student.studentId, school_id: examQ.data?.school_id,
            status: "in_progress", started_at: new Date().toISOString(), answers: {},
            question_order: orderIds,
          } as never, { onConflict: "exam_id,student_id" }).select("id").maybeSingle();
          if (data?.id) { attemptIdRef.current = data.id as string; setLiveAttemptId(data.id as string); }
        } else {
          void supabase.from("exam_attempts").update({
            question_order: orderIds,
            status: "in_progress",
          } as never).eq("id", attemptIdRef.current);
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

  if (examQ.isLoading || (examQ.isFetching && !examQ.data)) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading examination…</p>
      </div>
    );
  }
  if (questionsQ.isLoading && !questionsQ.data && !questionsQ.isError) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading questions…</p>
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
          <h1 className="mt-4 text-2xl font-extrabold">
            {previewMode
              ? "Preview ended"
              : doneTerminated
                ? (terminationReason.toLowerCase().includes("automatically submitted")
                    ? "Examination auto-submitted"
                    : "Examination terminated")
                : "Examination completed"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {previewMode
              ? "Officer preview finished."
              : doneTerminated
                ? (terminationReason || "Your examination was closed due to a security rule.")
                : "Your answers were submitted successfully."}
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
    <div className="d4-cbt-exam fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-slate-50 select-none">
      {previewMode && (
        <div className="shrink-0 bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">
          OFFICER PREVIEW — answers are not saved
        </div>
      )}
      <header className="d4-cbt-header relative z-40 shrink-0 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-11 max-w-[1200px] items-center justify-between gap-2 px-2.5 sm:h-12 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName} size="sm" className="bg-transparent" />
            <p className="hidden truncate text-sm font-bold sm:block">{(exam as { courses?: { code?: string } }).courses?.code ?? "EXAM"} — {exam.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm font-bold tabular-nums">{mm}:{ss}</div>
            <Button size="sm" variant="secondary" className="font-semibold" onClick={() => void requestSubmit()}>Submit</Button>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
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
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <Button variant="outline" className="rounded-lg font-semibold" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button className="rounded-lg font-semibold" disabled={index >= TOTAL - 1} onClick={() => setIndex((i) => Math.min(TOTAL - 1, i + 1))}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
      </div>
      {started && !done && !paused && security.requireCamera && (
        <ExamCameraPip
          enabled={started && !done && !paused}
          faceDetection={Boolean(security.faceDetection || security.requireCamera)}
          maxFaceWarnings={security.maxFaceWarnings ?? 3}
          stream={liveStream}
          onSecurityEvent={onFaceSecurityEvent}
          onNeedReconnect={() => {}}
        />
      )}
      {warnBanner && started && !done && (
        <div className="fixed inset-x-0 top-14 z-[150] flex justify-center px-3 pointer-events-none sm:top-16">
          <div className="max-w-md rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900 shadow-lg">
            Exam Integrity Warning — {warnBanner}
          </div>
        </div>
      )}
      {paused && started && !done && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-white p-6 text-center shadow-2xl">
            <h2 className="text-lg font-extrabold text-slate-900">EXAMINATION PAUSED</h2>
            <p className="mt-2 text-sm text-slate-600">Your examination has been paused because an integrity violation was detected.</p>
            {pauseReason ? <p className="mt-3 text-xs font-semibold text-slate-800">Reason: {pauseReason}</p> : null}
            <PauseContinueButton examId={id} onContinue={() => { setPaused(false); setPauseReason(""); void restoreFullscreenFromUser(); }} />
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


function PauseContinueButton({ examId, onContinue }: { examId: string; onContinue: () => void }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => {
      try {
        const raw = sessionStorage.getItem(`d4-pause-end-${examId}`);
        if (!raw) { setLeft(0); return; }
        setLeft(Math.max(0, Math.ceil((new Date(raw).getTime() - Date.now()) / 1000)));
      } catch { setLeft(0); }
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [examId]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Examination will resume in</p>
      <p className="mt-1 font-mono text-3xl font-extrabold tabular-nums text-primary">{mm}:{ss}</p>
      <Button className="mt-5 w-full font-semibold" disabled={left > 0} onClick={onContinue}>Continue Exam</Button>
    </>
  );
}

export { CbtExamPage as CbtExamSession };
