import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { SubmitConfirmDialog, ResumeBanner } from "@/components/cbt/CbtExamExtras";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext, canStartExam, examAvailability, formatExamWindow } from "@/lib/student";
import { remainingSecondsFromStart, restoreAnswers } from "@/lib/cbt-resume";
import { fromExamSettingsRow, resolveScreenShareMode, type ExamSettingsRow } from "@/lib/exam-security";
import { scoreObjectiveAnswers, logSecurityEvent } from "@/lib/cbt-security";
import { createFaceEngine, type FaceEngine } from "@/lib/face-detector";
import { parseExamMeta, pickExamQuestions, seededShuffle } from "@/lib/exam-meta";
import { capabilitiesSnapshot, detectDeviceCapabilities, type DeviceCapabilities } from "@/lib/device-capabilities";
import { toast } from "sonner";

type ExamDetail = {
  id: string; title: string; status: string; duration_minutes: number;
  scheduled_start: string | null; scheduled_end: string | null;
  course_id: string | null; school_id: string; description: string | null;
  courses: { code: string; name: string } | null;
};
type QRow = { id: string; question_text: string; question_type: string; marks: number; correct_answer: string | null; explanation: string | null };
type FaceState = "ok" | "none" | "multi" | "unknown" | "unavailable";

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
function resolveCorrectOptionText(correctAnswer: string | null, originalOptions: string[]): string | null {
  const raw = (correctAnswer || "").trim();
  if (!raw) return null;
  if (/^[A-D]$/i.test(raw)) {
    const i = raw.toUpperCase().charCodeAt(0) - 65;
    return originalOptions[i] ?? raw;
  }
  return raw;
}

export function CbtExamPage() {
  const { id } = useParams({ from: "/student/exam/$id" });
  const { data: student } = useStudentContext();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const indexRef = useRef(0);
  const faceWarnCountRef = useRef(0);
  const lastToastKeyRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const prevFaceRef = useRef<FaceState>("unknown");
  const capsRef = useRef<DeviceCapabilities | null>(null);
  const dragState = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  const setVideoNode = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    const stream = camStreamRef.current;
    if (node && stream) {
      if (node.srcObject !== stream) node.srcObject = stream;
      node.muted = true;
      node.setAttribute("playsinline", "true");
      node.setAttribute("autoplay", "true");
      void node.play().catch(() => {});
    }
  }, []);

  const [pip, setPip] = useState({ x: 16, y: 16 });
  const [index, setIndex] = useState(0);
  indexRef.current = index;

  const examQ = useQuery({
    queryKey: ["cbt-exam", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("examinations")
        .select("id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, courses(code, name)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as ExamDetail | null;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["cbt-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("exam_settings")
        .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, require_screen_share, screen_share_mode, threshold_action, face_violation_action, total_marks, instructions, result_visibility, questions_to_answer")
        .eq("exam_id", id).maybeSingle();
      if (error) {
        const { data: d2, error: e2 } = await supabase.from("exam_settings")
          .select("exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, face_detection, max_face_warnings, threshold_action, total_marks, instructions, result_visibility")
          .eq("exam_id", id).maybeSingle();
        if (e2) throw e2;
        return d2 as ExamSettingsRow | null;
      }
      return data as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.id && examQ.data?.school_id),
    queryFn: async () => {
      const exam = examQ.data!;
      const { data: links } = await supabase.from("exam_questions").select("question_id, question_order, marks").eq("exam_id", exam.id).order("question_order", { ascending: true });
      const linkIds = (links ?? []).map((l) => (l as { question_id: string }).question_id);
      if (linkIds.length > 0) {
        const { data, error } = await supabase.from("questions").select("id, question_text, question_type, marks, correct_answer, explanation").in("id", linkIds).eq("status", "active");
        if (error) throw error;
        const byId = new Map((data ?? []).map((q) => [q.id as string, q as QRow]));
        return linkIds.map((qid) => byId.get(qid)).filter(Boolean) as QRow[];
      }
      if (!exam.course_id) return [] as QRow[];
      const { data, error } = await supabase.from("questions").select("id, question_text, question_type, marks, correct_answer, explanation").eq("school_id", exam.school_id).eq("course_id", exam.course_id).eq("status", "active").order("created_at", { ascending: true }).limit(200);
      if (error) throw error;
      return (data ?? []) as QRow[];
    },
  });

  const security = useMemo(() => fromExamSettingsRow(settingsQ.data, examQ.data?.description), [settingsQ.data, examQ.data?.description]);
  const shareMode = resolveScreenShareMode(security);
  const screenRequired = shareMode === "required";

  // Detect in-progress attempt for Continue Exam
  useEffect(() => {
    if (!student?.studentId || !id) return;
    void (async () => {
      const { data } = await supabase.from("exam_attempts")
        .select("id, status, started_at, answers")
        .eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
      if (!data) return;
      if (["submitted", "terminated", "flagged"].includes(String(data.status))) {
        setDoneTerminated(String(data.status) === "terminated");
        setDone(true);
        return;
      }
      if (String(data.status) === "in_progress" && data.started_at) {
        attemptIdRef.current = data.id as string;
        setResumeMeta({ attemptId: data.id as string, startedAt: data.started_at as string });
        const restored = restoreAnswers(data.answers);
        if (Object.keys(restored).length) setAnswers(restored);
      }
    })();
  }, [student?.studentId, id]);

  const questionsToAnswer = useMemo(() => {
    const fromSettings = (settingsQ.data as ExamSettingsRow | null)?.questions_to_answer;
    if (typeof fromSettings === "number" && fromSettings > 0) return Math.floor(fromSettings);
    const meta = parseExamMeta(examQ.data?.description);
    return meta.questionsToAnswer && meta.questionsToAnswer > 0 ? meta.questionsToAnswer : null;
  }, [settingsQ.data, examQ.data?.description]);

  const questions = useMemo(() => {
    const bank = (questionsQ.data ?? []).map((q) => {
      let opts = decodeOptions(q.explanation);
      if (opts.length === 0 && (q.question_type === "true_false" || q.question_type === "True/False")) opts = ["True", "False"];
      if (opts.length === 0) opts = ["Option A", "Option B", "Option C", "Option D"];
      return { ...q, options: opts, correctOptionText: resolveCorrectOptionText(q.correct_answer, opts) };
    });
    const limited = pickExamQuestions(bank, { questionsToAnswer, randomize: security.randomizeQuestions, studentKey: student?.studentId ?? "anon", examId: id });
    if (security.randomizeOptions) {
      return limited.map((q) => ({ ...q, options: seededShuffle(q.options, `${id}:${student?.studentId ?? "anon"}:${q.id}:opts`) }));
    }
    return limited;
  }, [questionsQ.data, security.randomizeQuestions, security.randomizeOptions, questionsToAnswer, student?.studentId, id]);

  const TOTAL = questions.length;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [doneTerminated, setDoneTerminated] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [screenReady, setScreenReady] = useState(false);
  const [faceStatus, setFaceStatus] = useState<FaceState>("unknown");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [resumeMeta, setResumeMeta] = useState<{ attemptId: string; startedAt: string } | null>(null);

  const toastCooldowned = (key: string, msg: string, kind: "warn" | "ok" = "warn") => {
    const now = Date.now();
    if (lastToastKeyRef.current.key === key && now - lastToastKeyRef.current.at < 8000) return;
    lastToastKeyRef.current = { key, at: now };
    if (kind === "ok") toast.success(msg); else toast.warning(msg);
  };

  const logEvent = useCallback((eventType: string, severity: "low" | "medium" | "high", description: string, extra?: Record<string, unknown>) => {
    if (!examQ.data || !student) return;
    void logSecurityEvent({
      schoolId: examQ.data.school_id, examId: examQ.data.id, attemptId: attemptIdRef.current, studentId: student.studentId,
      eventType, severity, description, questionId: questions[indexRef.current]?.id ?? null, questionIndex: indexRef.current + 1,
      extra: { ...capabilitiesSnapshot(capsRef.current ?? detectDeviceCapabilities(), { cameraActive: camReady, screenShareActive: screenReady, faceStatus }), ...(extra ?? {}) },
    });
  }, [examQ.data, student, questions, camReady, screenReady, faceStatus]);

  // Persist answers while in progress so resume works
  useEffect(() => {
    if (!started || !attemptIdRef.current) return;
    const payload = answers;
    const tId = window.setTimeout(() => {
      void supabase.from("exam_attempts").update({
        answers: payload,
        updated_at: new Date().toISOString(),
      } as never).eq("id", attemptIdRef.current!);
    }, 800);
    return () => window.clearTimeout(tId);
  }, [answers, started]);

  useEffect(() => {
    if (!started || paused || seconds == null) return;
    if (seconds <= 0) { void finishAttempt(true); return; }
    const t = setInterval(() => setSeconds((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [started, paused, seconds === 0]);

  useEffect(() => {
    if (!started) return;
    const onVis = () => {
      if (document.hidden && security.tabMonitoring) {
        setTabSwitches((n) => {
          const next = n + 1;
          logEvent("TAB_SWITCH", "medium", `Tab switch ${next}/${security.maxTabSwitches}`, { count: next });
          if (next >= security.maxTabSwitches) {
            if (security.thresholdAction === "terminate") { toast.error("Too many tab switches — exam terminated"); void finishAttempt(true); }
            else toast.warning("Tab switch limit reached");
          } else toast.warning(`Tab switch (${next}/${security.maxTabSwitches})`);
          return next;
        });
      }
    };
    const blockClipboard = (e: Event) => { e.preventDefault(); toast.message("Copy / paste is disabled during the exam"); };
    const blockSelect = (e: Event) => { e.preventDefault(); };
    const blockDrag = (e: Event) => { e.preventDefault(); };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("copy", blockClipboard, true);
    document.addEventListener("paste", blockClipboard, true);
    document.addEventListener("cut", blockClipboard, true);
    document.addEventListener("contextmenu", blockClipboard, true);
    document.addEventListener("selectstart", blockSelect, true);
    document.addEventListener("dragstart", blockDrag, true);
    document.body.style.userSelect = "none";
    (document.body.style as any).webkitUserSelect = "none";
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("copy", blockClipboard, true);
      document.removeEventListener("paste", blockClipboard, true);
      document.removeEventListener("cut", blockClipboard, true);
      document.removeEventListener("contextmenu", blockClipboard, true);
      document.removeEventListener("selectstart", blockSelect, true);
      document.removeEventListener("dragstart", blockDrag, true);
      document.body.style.userSelect = "";
      (document.body.style as any).webkitUserSelect = "";
    };
  }, [started, security.tabMonitoring, security.maxTabSwitches]);

  useEffect(() => {
    if (!started || !camReady) return;
    const stream = camStreamRef.current;
    if (!stream) return;
    const attach = () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.srcObject !== stream) video.srcObject = stream;
      video.muted = true;
      video.setAttribute("playsinline", "true");
      void video.play().catch(() => {});
    };
    attach();
    const t = window.setTimeout(attach, 150);
    const t2 = window.setTimeout(attach, 500);
    return () => { window.clearTimeout(t); window.clearTimeout(t2); };
  }, [started, camReady]);

  useEffect(() => {
    if (!started || !camReady || !security.requireCamera || !security.faceDetection) return;
    const video = videoRef.current;
    if (video && camStreamRef.current) { video.srcObject = camStreamRef.current; void video.play().catch(() => {}); }
    let cancelled = false;
    let engine: FaceEngine | null = null;
    let interval = 0;
    const tick = async () => {
      if (cancelled || !videoRef.current || !engine) return;
      const n = await engine.count(videoRef.current);
      if (n == null) return;
      if (n === 0) {
        setFaceStatus("none");
        toastCooldowned("face-none", "⚠️ Face not detected. Please position your face clearly in front of the camera.");
        faceWarnCountRef.current += 1;
        logEvent("FACE_NOT_DETECTED", "medium", "No face detected", { faces: 0, engine: engine.backend });
        if (faceWarnCountRef.current >= (security.maxFaceWarnings || 5)) {
          const action = security.faceViolationAction || security.thresholdAction || "flag";
          if (action === "terminate") { toast.error("Too many face warnings — exam terminated"); void finishAttempt(true); }
          else if (action === "pause") { setPaused(true); toast.warning("Exam paused due to face warnings"); }
          else toast.warning("Multiple face warnings recorded for review");
        }
      } else if (n >= 2) {
        setFaceStatus("multi");
        toastCooldowned("face-multi", "⚠️ Multiple faces detected. Only the registered student should be visible.");
        faceWarnCountRef.current += 1;
        logEvent("MULTIPLE_FACES_DETECTED", "high", `${n} faces detected`, { faces: n, engine: engine.backend });
      } else {
        if (prevFaceRef.current !== "ok") toastCooldowned("face-ok", "✓ Face detected.", "ok");
        setFaceStatus("ok");
      }
      prevFaceRef.current = n === 0 ? "none" : n >= 2 ? "multi" : "ok";
    };
    void (async () => {
      const e = await createFaceEngine();
      if (cancelled) { e?.close(); return; }
      engine = e;
      if (!engine) { setFaceStatus("unavailable"); logEvent("SECURITY_CHECK_FAILED", "low", "Face detection unsupported on this device"); return; }
      interval = window.setInterval(() => void tick(), 1000);
      void tick();
    })();
    return () => { cancelled = true; window.clearInterval(interval); engine?.close(); };
  }, [started, camReady, security.requireCamera, security.faceDetection, security.maxFaceWarnings]);

  async function requestCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: security.requireMicrophone,
      });
      camStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        void videoRef.current.play().catch(() => {});
      }
      setCamReady(true);
      setFaceStatus("unknown");
      toast.success("✓ Camera active");
      logEvent("CAMERA_PERMISSION_GRANTED", "low", "Camera permission granted");
      return true;
    } catch {
      setCamReady(false);
      setFaceStatus("unavailable");
      toast.warning("⚠️ Camera unavailable. Please enable your camera.");
      logEvent("CAMERA_UNAVAILABLE", "high", "Camera permission denied or unavailable");
      return false;
    }
  }

  async function requestScreenShare() {
    const caps = capsRef.current ?? detectDeviceCapabilities();
    if (!caps.screenShare) return false;
    try {
      const stream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setScreenReady(true);
      toast.success("✓ Screen sharing active");
      logEvent("SCREEN_SHARE_STARTED", "low", "Screen sharing started");
      return true;
    } catch {
      if (screenRequired) toast.warning("⚠️ Screen sharing is required for this examination.");
      return false;
    }
  }

  async function ensureAttemptRow(startedAtIso?: string) {
    if (!student || !examQ.data) return attemptIdRef.current ? { id: attemptIdRef.current } : null;
    if (attemptIdRef.current) return { id: attemptIdRef.current };
    const startedAt = startedAtIso || new Date().toISOString();
    const { data, error } = await supabase.from("exam_attempts").upsert({
      exam_id: id, student_id: student.studentId, school_id: examQ.data.school_id, status: "in_progress",
      started_at: startedAt, answers: answers,
    } as never, { onConflict: "exam_id,student_id" }).select("id, started_at, answers").maybeSingle();
    if (!error && data?.id) {
      attemptIdRef.current = data.id as string;
      return data as { id: string; started_at?: string; answers?: unknown };
    }
    return null;
  }

  async function finishAttempt(auto = false) {
    if (done) return;
    const status = auto && (security.thresholdAction === "terminate" || security.faceViolationAction === "terminate") ? "terminated" : "submitted";
    try {
      const scored = scoreObjectiveAnswers(
        questions.map((q) => ({ id: q.id, marks: q.marks, correctOptionText: q.correctOptionText, chosenIndex: answers[q.id] ?? null, options: q.options })),
      );
      if (attemptIdRef.current) {
        await supabase.from("exam_attempts").update({
          status, submitted_at: new Date().toISOString(), score: scored.score, max_score: scored.maxScore, answers,
        } as never).eq("id", attemptIdRef.current);
      }
      await supabase.from("exam_results").upsert({
        exam_id: id, student_id: student?.studentId, school_id: examQ.data?.school_id,
        score: scored.score, max_score: scored.maxScore, status: "pending",
        security_review_status: status === "terminated" || faceWarnCountRef.current >= (security.maxFaceWarnings || 5) ? "flagged" : "pending",
      } as never, { onConflict: "exam_id,student_id" });
    } catch (e) { console.warn("finishAttempt", e); }
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    screenStreamRef.current = null;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    toast.success(auto ? "Examination closed" : "Examination submitted successfully");
    setDoneTerminated(status === "terminated");
    setDone(true);
  }

  async function beginWithMedia(opts: { skipScreenShare: boolean; caps: DeviceCapabilities }) {
    setMediaBusy(true);
    capsRef.current = opts.caps;
    try {
      if (student) {
        const { data: existing } = await supabase.from("exam_attempts").select("id, status, started_at, answers").eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
        if (existing && ["submitted", "terminated", "flagged"].includes(String(existing.status))) {
          toast.error("You have already completed this examination.");
          setDoneTerminated(String(existing.status) === "terminated");
          setDone(true);
          return;
        }
        if (existing?.id) attemptIdRef.current = existing.id as string;
        if (existing && String(existing.status) === "in_progress" && existing.started_at) {
          setResumeMeta({ attemptId: existing.id as string, startedAt: existing.started_at as string });
        }
      }
      logEvent("SECURITY_CHECK_PASSED", "low", "Device capability snapshot", { ...capabilitiesSnapshot(opts.caps), screen_share_mode: shareMode });
      if (security.requireCamera) {
        const camOk = await requestCamera();
        if (!camOk) { setMediaBusy(false); return; }
      }
      if (!opts.skipScreenShare && (shareMode === "required" || shareMode === "optional")) {
        if (opts.caps.screenShare) {
          const scrOk = await requestScreenShare();
          if (!scrOk && shareMode === "required") { setMediaBusy(false); return; }
        } else if (shareMode === "required") {
          toast.warning("This examination requires a desktop browser with screen-sharing support.");
          setMediaBusy(false);
          return;
        }
      }
      let startedAt = resumeMeta?.startedAt;
      if (resumeMeta?.attemptId) attemptIdRef.current = resumeMeta.attemptId;
      const row = await ensureAttemptRow(startedAt);
      if (row && "started_at" in row && row.started_at) startedAt = row.started_at as string;
      if (!startedAt) startedAt = new Date().toISOString();
      if (row && "answers" in row) {
        const restored = restoreAnswers(row.answers);
        if (Object.keys(restored).length) setAnswers(restored);
      }
      if (security.fullscreen) {
        try { await document.documentElement.requestFullscreen?.(); } catch { toast.message("Please allow fullscreen"); }
      }
      const remaining = remainingSecondsFromStart(startedAt, examQ.data?.duration_minutes ?? 60);
      if (remaining <= 0) {
        toast.error("Time is up for this examination.");
        setSeconds(0);
        setStarted(true);
        void finishAttempt(true);
        return;
      }
      setSeconds(remaining);
      setStarted(true);
      if (!resumeMeta) setIndex(0);
    } finally {
      setMediaBusy(false);
    }
  }

  const onPipPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = { ox: e.clientX, oy: e.clientY, px: pip.x, py: pip.y };
  };
  const onPipPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.ox;
    const dy = e.clientY - dragState.current.oy;
    setPip({ x: Math.max(8, dragState.current.px - dx), y: Math.max(8, dragState.current.py - dy) });
  };
  const onPipPointerUp = () => { dragState.current = null; };

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
        <div><p className="font-bold text-slate-900">Examination not found</p>
          <Button className="mt-4" asChild><Link to="/student/examinations">Back</Link></Button></div>
      </div>
    );
  }
  const avail = examAvailability(exam.status, exam.scheduled_start, exam.scheduled_end);
  if (avail !== "available" && !done && !resumeMeta) {
    const msg =
      avail === "missed"
        ? "You missed this examination. The scheduled window has ended. Contact your examination officer if you need a reschedule."
        : avail === "upcoming"
          ? `This examination opens at ${exam.scheduled_start ? new Date(exam.scheduled_start).toLocaleString() : "the scheduled time"}.`
          : "This examination is not available.";
    return (
      <div className="grid min-h-dvh place-items-center p-4 sm:p-6 text-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-extrabold text-slate-900">{avail === "missed" ? "Exam missed" : "Not available yet"}</p>
          <p className="mt-2 text-sm text-slate-600">{msg}</p>
          <p className="mt-3 text-xs text-slate-500">{formatExamWindow(exam.scheduled_start, exam.scheduled_end)}</p>
          <p className="mt-1 text-xs text-slate-500">Duration: {exam.duration_minutes} minutes · {TOTAL} questions</p>
          <Button className="mt-6" asChild><Link to="/student/examinations">Back to exams</Link></Button>
        </div>
      </div>
    );
  }
  if (done) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4 sm:p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Logo size="md" className="mx-auto justify-center" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Examination completed</h1>
          <p className="mt-2 text-sm text-slate-600">{doneTerminated ? "Your attempt was closed by the security system." : "Your answers were submitted successfully. You cannot rewrite this examination."}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="font-semibold" asChild><Link to="/student/results">Go to My Results</Link></Button>
            <Button variant="outline" className="font-semibold" asChild><Link to="/student/examinations">Back to examinations</Link></Button>
          </div>
        </div>
      </div>
    );
  }
  if (!started) {
    return (
      <div>
        {resumeMeta && <ResumeBanner />}
        <ExamSecurityGate
          examTitle={exam.title}
          courseLine={`${exam.courses?.code ?? ""} · ${exam.courses?.name ?? ""}`}
          durationMinutes={exam.duration_minutes}
          totalQuestions={TOTAL}
          security={security}
          busy={mediaBusy}
          continueMode={Boolean(resumeMeta)}
          windowLabel={formatExamWindow(exam.scheduled_start, exam.scheduled_end)}
          onStart={(opts) => void beginWithMedia(opts)}
        />
      </div>
    );
  }
  if (TOTAL === 0) {
    return <div className="grid min-h-dvh place-items-center"><p className="text-sm text-slate-600">No questions available.</p></div>;
  }

  const mm = String(Math.floor((seconds ?? 0) / 60)).padStart(2, "0");
  const ss = String((seconds ?? 0) % 60).padStart(2, "0");
  const q = questions[index];
  const answeredCount = Object.keys(answers).length;
  const camDot = !security.requireCamera ? null : camReady ? "bg-emerald-400" : "bg-red-400";
  const faceDot = !security.requireCamera || !security.faceDetection ? null : faceStatus === "ok" ? "bg-emerald-400" : faceStatus === "none" || faceStatus === "multi" ? "bg-amber-400" : "bg-slate-400";

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 select-none" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-3 sm:h-[4.5rem] sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="md" wordmark={false} />
            <p className="hidden truncate text-sm font-bold text-primary sm:block sm:text-base">{exam.courses?.code ?? "EXAM"} — {exam.title}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 text-[10px] font-bold sm:flex">
              {camDot && <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1"><span className={cn("h-2 w-2 rounded-full", camDot)} /> Cam</span>}
              {faceDot && <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1"><span className={cn("h-2 w-2 rounded-full", faceDot)} /> Face</span>}
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm font-bold tabular-nums">{mm}:{ss}</div>
            <Button size="sm" variant="secondary" className="font-semibold" onClick={() => setConfirmSubmit(true)}>Submit</Button>
          </div>
        </div>
      </header>

      {paused && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
          Exam paused by security. Resume when ready.
          <Button size="sm" className="ml-3" onClick={() => setPaused(false)}>Resume</Button>
        </div>
      )}

      <div className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 gap-4 p-3 sm:p-6 lg:grid-cols-[220px_1fr]">
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
          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl select-none">{q?.question_text}</h1>
          <ul className="mt-6 space-y-3">
            {(q?.options ?? []).map((opt, oi) => {
              const selected = q ? answers[q.id] === oi : false;
              return (
                <li key={oi}>
                  <button type="button" onClick={() => q && setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition",
                      selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/40")}>
                    <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold",
                      selected ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-500")}>{String.fromCharCode(65 + oi)}</span>
                    <span className="select-none">{opt}</span>
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

      <SubmitConfirmDialog
        open={confirmSubmit}
        answered={answeredCount}
        total={TOTAL}
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={() => { setConfirmSubmit(false); void finishAttempt(false); }}
      />

      {camReady && (
        <div className="fixed z-50 w-[132px] touch-none overflow-hidden rounded-xl border-2 border-primary bg-black shadow-2xl sm:w-[168px]"
          style={{ right: pip.x, bottom: pip.y }}
          onPointerDown={onPipPointerDown} onPointerMove={onPipPointerMove} onPointerUp={onPipPointerUp} onPointerCancel={onPipPointerUp}>
          <div className="flex cursor-grab items-center gap-1 bg-primary/90 px-2 py-0.5 active:cursor-grabbing">
            <GripVertical className="h-3 w-3 text-white" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-white">Drag me</span>
          </div>
          <video ref={setVideoNode} className="aspect-[4/3] w-full object-cover scale-x-[-1] bg-black" autoPlay playsInline muted />
          <div className={cn("px-2 py-1 text-center text-[10px] font-bold text-white",
            faceStatus === "multi" && "bg-red-600", faceStatus === "none" && "bg-amber-600",
            faceStatus === "ok" && "bg-emerald-600", (faceStatus === "unknown" || faceStatus === "unavailable") && "bg-primary")}>
            {faceStatus === "multi" ? "Multiple faces" : faceStatus === "none" ? "Face not seen" : faceStatus === "ok" ? "Monitoring · 1 face" : faceStatus === "unavailable" ? "Camera off" : "Live camera"}
          </div>
        </div>
      )}
    </div>
  );
}
