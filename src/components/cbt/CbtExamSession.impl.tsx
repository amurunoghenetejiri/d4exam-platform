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
import { parseExamMeta, pickExamQuestions, seededShuffle } from "@/lib/exam-meta";
import { type DeviceCapabilities } from "@/lib/device-capabilities";
import { toast } from "sonner";
import { ExamCameraPip, type FaceSecurityEvent } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { logSecurityEvent } from "@/lib/cbt-security";
import { haptic, hapticOfficerWarning } from "@/lib/haptic";
import { mapFaceSecurityEvent } from "@/lib/live-monitor";
import { startLiveCamPublisher, type LiveCamPublisher } from "@/lib/live-video";

function isPreviewPath() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/officer/exam-preview");
}
function decodeOptions(explanation: string | null): string[] {
  if (!explanation) return [];
  const optLine = explanation.split("\n").find((l) => l.startsWith("OPTIONS::"));
  if (!optLine) return [];
  const body = optLine.slice("OPTIONS::".length);
  const map: Record<string, string> = {};
  for (const part of body.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0) map[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1);
  }
  return ["A", "B", "C", "D"].map((k) => map[k]).filter(Boolean) as string[];
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
  if (document.fullscreenElement) return true;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return Boolean(document.fullscreenElement);
    }
  } catch { /* blocked */ }
  return Boolean(document.fullscreenElement);
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
  const attemptIdRef = useRef<string | null>(null);
  const facePresenceRef = useRef<{ faceStatus: string; faceCount: number | null; cameraActive: boolean }>({
    faceStatus: "unknown", faceCount: null, cameraActive: false,
  });
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveCamPublisherRef = useRef<LiveCamPublisher | null>(null);
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
        .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, total_marks, instructions, result_visibility, questions_to_answer")
        .eq("exam_id", id).maybeSingle();
      return data as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const exam = examQ.data!;
      let q = supabase.from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation")
        .eq("course_id", exam.course_id!).in("status", ["active", "approved"])
        .order("created_at", { ascending: true }).limit(200);
      if (exam.school_id) q = q.eq("school_id", exam.school_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);

  const stopLiveCamStream = useCallback(() => {
    liveCamPublisherRef.current?.stop();
    liveCamPublisherRef.current = null;
  }, []);

  const shutdownMedia = useCallback(() => {
    stopLiveCamStream();
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
  }, [stopLiveCamStream]);

  const invalidateStudentExamCaches = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["student-attempts"] }),
      qc.invalidateQueries({ queryKey: ["student-result-ids"] }),
      qc.invalidateQueries({ queryKey: ["student-exams"] }),
      qc.invalidateQueries({ queryKey: ["student-results"] }),
      qc.invalidateQueries({ queryKey: ["student-dashboard-exams"] }),
      qc.invalidateQueries({ queryKey: ["student-dashboard-attempts"] }),
      qc.invalidateQueries({ queryKey: ["student-dashboard-results"] }),
      qc.invalidateQueries({ queryKey: ["student-history-results"] }),
      qc.invalidateQueries({ queryKey: ["student-history-attempts"] }),
    ]);
  }, [qc]);

  useEffect(() => {
    if (previewMode || !student?.studentId || !id) return;
    void (async () => {
      const { data } = await supabase.from("exam_attempts").select("id, status")
        .eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
      if (data && ["submitted", "terminated", "flagged"].includes(String(data.status))) {
        shutdownMedia();
        setDoneTerminated(String(data.status) === "terminated");
        setDone(true);
        const { data: res } = await supabase.from("results").select("id")
          .eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
        if (res?.id) setResultId(res.id as string);
      }
    })();
  }, [previewMode, student?.studentId, id, shutdownMedia]);

  useEffect(() => {
    if (!started || done) return;
    const block = (e: Event) => { e.preventDefault(); toast.message("Copy / paste is disabled during the exam"); };
    document.addEventListener("copy", block, true);
    document.addEventListener("paste", block, true);
    document.addEventListener("cut", block, true);
    document.addEventListener("contextmenu", block, true);
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("copy", block, true);
      document.removeEventListener("paste", block, true);
      document.removeEventListener("cut", block, true);
      document.removeEventListener("contextmenu", block, true);
      document.body.style.userSelect = "";
    };
  }, [started, done]);

  useEffect(() => {
    if (!started || done || !security.fullscreen) { setFsGate(false); return; }
    const ensureFullscreen = async () => {
      if (doneRef.current || !startedRef.current) return;
      if (document.fullscreenElement) { setFsGate(false); return; }
      const ok = await requestExamFullscreen();
      if (ok) setFsGate(false); else setFsGate(true);
    };
    void ensureFullscreen();
    const onFsChange = () => {
      if (doneRef.current || !startedRef.current) return;
      if (document.fullscreenElement) setFsGate(false);
      else { setFsGate(true); void ensureFullscreen(); }
    };
    const onReturn = () => {
      if (doneRef.current || !startedRef.current) return;
      if (document.visibilityState !== "visible") return;
      void ensureFullscreen();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    window.addEventListener("pageshow", onReturn);
    const tick = window.setInterval(() => {
      if (doneRef.current || !startedRef.current) return;
      if (document.visibilityState !== "visible") return;
      if (!document.fullscreenElement) { setFsGate(true); void ensureFullscreen(); }
    }, 2500);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("pageshow", onReturn);
      window.clearInterval(tick);
    };
  }, [started, done, security.fullscreen]);

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
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    }
  }, [done, shutdownMedia]);

  useEffect(() => () => {
    stopLiveCamStream();
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
  }, [stopLiveCamStream]);

  useEffect(() => {
    stopLiveCamStream();
    if (previewMode || !started || done) return;
    if (!security.requireCamera) return;
    const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? "");
    const studentId = student?.studentId;
    const attemptId = attemptIdRef.current;
    if (!schoolId || !studentId || !attemptId) return;
    if (!liveStream) return;
    const publisher = startLiveCamPublisher({
      schoolId, attemptId, studentId, examId: id,
      getStream: () => mediaStreamRef.current ?? liveStream,
      getFaceMeta: () => ({
        faceStatus: facePresenceRef.current.faceStatus,
        cameraActive: facePresenceRef.current.cameraActive,
      }),
    });
    liveCamPublisherRef.current = publisher;
    return () => {
      publisher.stop();
      if (liveCamPublisherRef.current === publisher) liveCamPublisherRef.current = null;
    };
  }, [previewMode, started, done, security.requireCamera, liveStream, examQ.data?.school_id, student?.schoolId, student?.studentId, id, stopLiveCamStream]);

  const questionsToAnswer = useMemo(() => {
    const row = (settingsQ.data as { questions_to_answer?: number } | null)?.questions_to_answer;
    if (typeof row === "number" && row > 0) return Math.floor(row);
    const meta = parseExamMeta(examQ.data?.description);
    return meta.questionsToAnswer && meta.questionsToAnswer > 0 ? meta.questionsToAnswer : null;
  }, [settingsQ.data, examQ.data?.description]);

  const questions = useMemo(() => {
    const bank = (questionsQ.data ?? []).map((q) => {
      let opts = decodeOptions(q.explanation);
      if (opts.length === 0 && (q.question_type === "true_false" || q.question_type === "True/False")) opts = ["True", "False"];
      if (opts.length === 0) opts = ["Option A", "Option B", "Option C", "Option D"];
      return { ...q, options: opts };
    });
    const key = student?.studentId ?? (previewMode ? "officer-preview" : session?.userId ?? "anon");
    let picked = pickExamQuestions(bank as never, { questionsToAnswer, randomize: Boolean(security.randomizeQuestions), studentKey: key, examId: id });
    if (security.randomizeOptions) {
      picked = (picked as Array<{ id: string; options: string[] }>).map((q) => ({ ...q, options: seededShuffle(q.options, `${id}:${key}:${q.id}:opts`) }));
    }
    return picked as Array<{ id: string; question_text: string; marks: number; correct_answer: string | null; options: string[] }>;
  }, [questionsQ.data, questionsToAnswer, security.randomizeQuestions, security.randomizeOptions, student?.studentId, session?.userId, previewMode, id]);

  const TOTAL = questions.length;
  const q = questions[index];
  const answeredCount = Object.keys(answers).length;

  const onFaceSecurityEvent = useCallback((ev: FaceSecurityEvent) => {
    if (previewMode) return;
    const mapped = mapFaceSecurityEvent(ev.kind, ev.faceCount);
    facePresenceRef.current = {
      faceStatus: ev.kind === "ok" ? "ok" : ev.kind === "none" ? "none" : ev.kind === "multi" ? "multi" : ev.kind === "camera_blocked" ? "unavailable" : "unclear",
      faceCount: ev.faceCount,
      cameraActive: ev.kind !== "camera_blocked",
    };
    const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId ?? "");
    const studentId = student?.studentId;
    if (!schoolId || !studentId || !id) return;
    void logSecurityEvent({
      schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
      eventType: mapped.eventType, severity: mapped.severity, description: mapped.description,
      extra: { faceCount: ev.faceCount, source: "ExamCameraPip" },
    });
  }, [previewMode, examQ.data?.school_id, student?.studentId, student?.schoolId, session?.schoolId, id]);

  useEffect(() => {
    if (previewMode || !started || done) return;
    if (!security.tabMonitoring) return;
    const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId ?? "");
    const studentId = student?.studentId;
    if (!schoolId || !studentId || !id) return;
    let lastLog = 0;
    const onHide = () => {
      if (doneRef.current || !startedRef.current) return;
      if (document.visibilityState === "visible") return;
      const now = Date.now();
      if (now - lastLog < 1500) return;
      lastLog = now;
      const aid = attemptIdRef.current;
      void logSecurityEvent({
        schoolId, examId: id, attemptId: aid, studentId,
        eventType: "TAB_SWITCH", severity: "medium",
        description: "Student left the exam tab or minimized the window",
        extra: { source: "visibilitychange" },
      });
      if (aid) {
        void (async () => {
          try {
            const { data: row } = await supabase.from("exam_attempts").select("tab_switch_count").eq("id", aid).maybeSingle();
            const next = Number((row as { tab_switch_count?: number } | null)?.tab_switch_count ?? 0) + 1;
            await supabase.from("exam_attempts").update({ tab_switch_count: next } as never).eq("id", aid);
          } catch (e) { console.warn("[cbt] tab_switch_count update failed", e); }
        })();
      }
      haptic("tab_switch");
      toast.error("Tab switch recorded — stay on the exam", { duration: 2600, id: "tab-switch-warn", className: "cbt-exam-toast" });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [previewMode, started, done, security.tabMonitoring, examQ.data?.school_id, student?.studentId, student?.schoolId, session?.schoolId, id]);

  useEffect(() => {
    if (previewMode || !started || done) return;
    const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? "");
    const studentId = student?.studentId;
    if (!schoolId || !studentId || !id) return;
    const channel = supabase
      .channel(`cbt-officer-warn-${studentId}-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "integrity_events", filter: `student_id=eq.${studentId}` }, (payload) => {
        const row = payload.new as { event_type?: string; exam_id?: string; description?: string | null };
        if (!row) return;
        if (row.exam_id && row.exam_id !== id) return;
        const t = String(row.event_type || "").toUpperCase();
        if (!t.includes("WARNING")) return;
        hapticOfficerWarning();
        toast.error("Officer warning: stay focused on the exam.", {
          id: "officer-warn-cbt", duration: 6000,
          description: row.description || "Keep your face visible and do not switch tabs. Swipe to dismiss.",
          className: "cbt-exam-toast",
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [previewMode, started, done, examQ.data?.school_id, student?.studentId, student?.schoolId, id]);

  useEffect(() => {
    if (previewMode || !started || done || !student?.studentId || !examQ.data?.school_id) return;
    const pushPresence = async () => {
      const aid = attemptIdRef.current;
      const fp = facePresenceRef.current;
      const camLive = Boolean(liveStream?.getVideoTracks().some((t) => t.readyState === "live"));
      const payload = {
        cameraActive: camLive || fp.cameraActive,
        faceStatus: fp.faceStatus,
        faceCount: fp.faceCount,
        lastSeenAt: new Date().toISOString(),
        fullscreen: Boolean(typeof document !== "undefined" && document.fullscreenElement),
        answeredCount: Object.keys(answers).length,
        totalQuestions: questions.length,
        secondsLeft: seconds,
      };
      if (!aid) return;
      try {
        await supabase.from("exam_attempts").update({ last_heartbeat_at: new Date().toISOString(), presence_meta: payload } as never).eq("id", aid);
      } catch { /* ignore */ }
    };
    void pushPresence();
    const t = window.setInterval(() => void pushPresence(), 8000);
    return () => window.clearInterval(t);
  }, [previewMode, started, done, student?.studentId, examQ.data?.school_id, liveStream, answers, questions.length, seconds]);

  async function beginExam(caps?: DeviceCapabilities) {
    if (previewMode) {
      setStarted(true);
      const mins = Number(examQ.data?.duration_minutes) || 30;
      setSeconds(mins * 60);
      if (security.fullscreen) void requestExamFullscreen();
      return;
    }
    if (!student?.studentId || !examQ.data) return;
    setMediaBusy(true);
    try {
      if (security.requireCamera || security.faceDetection) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
          mediaStreamRef.current = stream;
          setLiveStream(stream);
        } catch {
          toast.error("Camera is required for this exam. Please allow camera access.");
          setMediaBusy(false);
          return;
        }
      }
      const { data: existing } = await supabase.from("exam_attempts").select("id, status")
        .eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
      if (existing && ["submitted", "terminated", "flagged"].includes(String(existing.status))) {
        setDone(true);
        setMediaBusy(false);
        return;
      }
      let aid = existing?.id as string | undefined;
      if (!aid) {
        const { data: created, error } = await supabase.from("exam_attempts").insert({
          exam_id: id, student_id: student.studentId, school_id: examQ.data.school_id,
          status: "in_progress", started_at: new Date().toISOString(),
        } as never).select("id").single();
        if (error) throw error;
        aid = (created as { id: string }).id;
      } else {
        await supabase.from("exam_attempts").update({ status: "in_progress", started_at: new Date().toISOString() } as never).eq("id", aid);
      }
      attemptIdRef.current = aid ?? null;
      const mins = Number(examQ.data.duration_minutes) || 30;
      setSeconds(mins * 60);
      setStarted(true);
      if (security.fullscreen) void requestExamFullscreen();
      void logSecurityEvent({
        schoolId: String(examQ.data.school_id), examId: id, attemptId: aid ?? null, studentId: student.studentId,
        eventType: "EXAM_STARTED", severity: "info", description: "Student started the exam",
        extra: { caps: caps ?? null },
      });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setMediaBusy(false);
    }
  }

  async function finishAttempt(auto = false) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    if (!previewMode && student?.studentId && examQ.data) {
      try {
        const aid = attemptIdRef.current;
        if (aid) {
          await supabase.from("exam_attempts").update({
            status: auto ? "submitted" : "submitted",
            submitted_at: new Date().toISOString(),
          } as never).eq("id", aid);
        }
        const saved = await saveCbtResult({
          examId: id,
          studentId: student.studentId,
          schoolId: String(examQ.data.school_id),
          attemptId: aid,
          questions: questions.map((qq) => ({
            id: qq.id, marks: qq.marks, correct_answer: qq.correct_answer, options: qq.options,
          })),
          answers,
          terminated: false,
          resultVisibility: (settingsQ.data as { result_visibility?: string } | null)?.result_visibility,
        });
        if (saved?.id) setResultId(saved.id);
        void logSecurityEvent({
          schoolId: String(examQ.data.school_id), examId: id, attemptId: aid, studentId: student.studentId,
          eventType: auto ? "AUTO_SUBMIT" : "SUBMITTED", severity: "info",
          description: auto ? "Exam auto-submitted when time expired" : "Student submitted the exam",
        });
        await invalidateStudentExamCaches();
      } catch (e) {
        toast.error(friendlyError(e));
        finishingRef.current = false;
        return;
      }
    }
    shutdownMedia();
    setDone(true);
    finishingRef.current = false;
  }

  const loading = examQ.isLoading || settingsQ.isLoading || questionsQ.isLoading;
  const exam = examQ.data;
  const courseLabel = (() => {
    const c = (exam as { courses?: { code?: string; name?: string } | null } | null)?.courses;
    if (!c) return "";
    return [c.code, c.name].filter(Boolean).join(" · ");
  })();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="font-bold">Exam not found</p>
        <Button className="mt-4" asChild><Link to="/student/examinations">Back</Link></Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-extrabold text-slate-900">{doneTerminated ? "Exam terminated" : "Exam submitted"}</p>
          <p className="mt-2 text-sm text-slate-500">Your answers have been saved. You may leave this page.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {resultId ? (
              <Button asChild><Link to={`/student/results/${resultId}` as never}>View result</Link></Button>
            ) : null}
            <Button variant="outline" asChild><Link to="/student/examinations">Back to exams</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <ExamSecurityGate
        examTitle={exam.title}
        courseLabel={courseLabel}
        durationMinutes={Number(exam.duration_minutes) || 30}
        instructions={(settingsQ.data as { instructions?: string } | null)?.instructions || exam.description}
        security={security}
        busy={mediaBusy}
        previewMode={previewMode}
        onStart={(caps) => void beginExam(caps)}
        onCancel={() => navigate({ to: previewMode ? "/officer" : "/student/examinations" })}
      />
    );
  }

  const mm = seconds != null ? Math.floor(seconds / 60) : 0;
  const ss = seconds != null ? seconds % 60 : 0;
  const timeLabel = seconds != null ? `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : "—";

  return (
    <div className="relative min-h-dvh bg-slate-50">
      {security.requireCamera ? (
        <ExamCameraPip
          enabled={started && !done}
          faceDetection={security.faceDetection}
          maxFaceWarnings={security.maxFaceWarnings}
          stream={liveStream}
          onSecurityEvent={onFaceSecurityEvent}
        />
      ) : null}

      {fsGate ? (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="font-bold text-slate-900">Fullscreen required</p>
            <p className="mt-1 text-sm text-slate-500">Tap below to continue your exam in fullscreen.</p>
            <Button className="mt-4" onClick={() => void requestExamFullscreen().then((ok) => { if (ok) setFsGate(false); })}>
              <Maximize className="mr-2 h-4 w-4" /> Enter fullscreen
            </Button>
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5 sm:px-4">
          <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? null} schoolName={schoolBrand?.name ?? null} size="sm" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{exam.title}</p>
            <p className="truncate text-[11px] text-slate-500">{courseLabel}</p>
          </div>
          <div className={cn("rounded-lg px-2.5 py-1 text-sm font-extrabold tabular-nums",
            seconds != null && seconds < 60 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-800")}>
            {timeLabel}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>Question {index + 1} of {TOTAL}</span>
          <span>{answeredCount} answered</span>
        </div>

        {q ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-semibold leading-relaxed text-slate-900 sm:text-base">{q.question_text}</p>
            <p className="mt-1 text-[11px] text-slate-400">{q.marks} mark{q.marks === 1 ? "" : "s"}</p>
            <div className="mt-4 space-y-2">
              {q.options.map((opt, oi) => {
                const selected = answers[q.id] === oi;
                return (
                  <button
                    key={`${q.id}-${oi}`}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                      selected ? "border-primary bg-primary/5 font-semibold text-primary" : "border-slate-200 bg-white text-slate-800 hover:border-slate-300",
                    )}
                  >
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                      selected ? "bg-primary text-white" : "bg-slate-100 text-slate-600")}>
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500">No questions available for this exam.</p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Prev
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => {
              if (!q) return;
              setFlagged((prev) => {
                const next = new Set(prev);
                if (next.has(q.id)) next.delete(q.id); else next.add(q.id);
                return next;
              });
            }}
          >
            <Flag className={cn("mr-1 h-4 w-4", q && flagged.has(q.id) && "fill-amber-500 text-amber-500")} />
            Flag
          </Button>
          {index < TOTAL - 1 ? (
            <Button size="sm" onClick={() => setIndex((i) => Math.min(TOTAL - 1, i + 1))}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => {
              if (!window.confirm("Submit your exam now? You cannot change answers after submitting.")) return;
              void finishAttempt(false);
            }}>
              Submit
            </Button>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {questions.map((qq, i) => (
            <button
              key={qq.id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-xs font-bold",
                i === index ? "bg-primary text-white" : answers[qq.id] != null ? "bg-emerald-100 text-emerald-800" : flagged.has(qq.id) ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
