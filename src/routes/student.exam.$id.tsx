import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2, Camera, Mic, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext, canStartExam } from "@/lib/student";
import {
  fromExamSettingsRow,
  parseSecurityFromDescription,
  type ExamSettingsRow,
} from "@/lib/exam-security";
import { scoreObjectiveAnswers, logSecurityEvent } from "@/lib/cbt-security";
import { parseExamMeta, pickExamQuestions, seededShuffle } from "@/lib/exam-meta";
import { toast } from "sonner";

export const Route = createFileRoute("/student/exam/$id")({
  head: () => ({
    meta: [
      { title: "CBT Examination — D4EXAM" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CbtExamPage,
});

type ExamDetail = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  course_id: string | null;
  school_id: string;
  description: string | null;
  courses: { code: string; name: string } | null;
};

type QRow = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  correct_answer: string | null;
  explanation: string | null;
};

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

function resolveCorrectOptionText(
  correctAnswer: string | null,
  originalOptions: string[],
): string | null {
  const raw = (correctAnswer || "").trim();
  if (!raw) return null;
  if (/^[A-Da-d]$/.test(raw) && originalOptions.length > 0) {
    const letterIdx = raw.toUpperCase().charCodeAt(0) - 65;
    return originalOptions[letterIdx] ?? null;
  }
  const byText = originalOptions.find((o) => o.trim().toLowerCase() === raw.toLowerCase());
  if (byText) return byText;
  return raw;
}

function CbtExamPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: student } = useStudentContext();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFaceToast = useRef(0);
  const pipPos = useRef({ x: 0, y: 0 });
  const dragState = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const [pip, setPip] = useState({ x: 16, y: 16 }); // from bottom-right origin via CSS right/bottom

  const examQ = useQuery({
    queryKey: ["cbt-exam", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, description, courses(code, name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as ExamDetail | null;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["cbt-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_settings")
        .select(
          "exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, threshold_action, total_marks, instructions, result_visibility, questions_to_answer",
        )
        .eq("exam_id", id)
        .maybeSingle();
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("exam_settings")
          .select(
            "exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, threshold_action, total_marks, instructions, result_visibility",
          )
          .eq("exam_id", id)
          .maybeSingle();
        if (e2) throw e2;
        return d2 as ExamSettingsRow | null;
      }
      return data as ExamSettingsRow | null;
    },
  });

  /** Prefer questions the teacher put on this exam paper; fall back to full course bank. */
  const questionsQ = useQuery({
    queryKey: ["cbt-questions", id, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.id && examQ.data?.school_id),
    queryFn: async () => {
      const exam = examQ.data!;

      const { data: links } = await supabase
        .from("exam_questions")
        .select("question_id, question_order, marks")
        .eq("exam_id", exam.id)
        .order("question_order", { ascending: true });

      const linkIds = (links ?? []).map((l) => (l as { question_id: string }).question_id);

      if (linkIds.length > 0) {
        const { data, error } = await supabase
          .from("questions")
          .select("id, question_text, question_type, marks, correct_answer, explanation")
          .in("id", linkIds)
          .eq("status", "active");
        if (error) throw error;
        const byId = new Map((data ?? []).map((q) => [q.id as string, q as QRow]));
        // Keep teacher paper order
        return linkIds.map((qid) => byId.get(qid)).filter(Boolean) as QRow[];
      }

      // Fallback: whole course bank (legacy exams without a paper)
      if (!exam.course_id) return [] as QRow[];
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation")
        .eq("school_id", exam.school_id)
        .eq("course_id", exam.course_id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as QRow[];
    },
  });

  const security = useMemo(() => {
    if (settingsQ.data) return fromExamSettingsRow(settingsQ.data);
    const fromDesc = parseSecurityFromDescription(examQ.data?.description);
    return fromDesc ?? fromExamSettingsRow(null);
  }, [settingsQ.data, examQ.data?.description]);

  const questionsToAnswer = useMemo(() => {
    const fromSettings = (settingsQ.data as ExamSettingsRow | null)?.questions_to_answer;
    if (typeof fromSettings === "number" && fromSettings > 0) return Math.floor(fromSettings);
    const meta = parseExamMeta(examQ.data?.description);
    if (meta.questionsToAnswer && meta.questionsToAnswer > 0) return meta.questionsToAnswer;
    return null;
  }, [settingsQ.data, examQ.data?.description]);

  const questions = useMemo(() => {
    const bank = (questionsQ.data ?? []).map((q) => {
      let opts = decodeOptions(q.explanation);
      if (opts.length === 0 && (q.question_type === "true_false" || q.question_type === "True/False")) {
        opts = ["True", "False"];
      }
      if (opts.length === 0) {
        opts = ["Option A", "Option B", "Option C", "Option D"];
      }
      const correctOptionText = resolveCorrectOptionText(q.correct_answer, opts);
      return { ...q, options: opts, correctOptionText };
    });
    const limited = pickExamQuestions(bank, {
      questionsToAnswer,
      randomize: security.randomizeQuestions,
      studentKey: student?.studentId ?? "anon",
      examId: id,
    });
    if (security.randomizeOptions) {
      return limited.map((q) => ({
        ...q,
        options: seededShuffle(q.options, `${id}:${student?.studentId ?? "anon"}:${q.id}:opts`),
      }));
    }
    return limited;
  }, [
    questionsQ.data,
    security.randomizeQuestions,
    security.randomizeOptions,
    questionsToAnswer,
    student?.studentId,
    id,
  ]);

  const TOTAL = questions.length;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [doneTerminated, setDoneTerminated] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [faceStatus, setFaceStatus] = useState<"ok" | "none" | "multi" | "unknown">("unknown");

  useEffect(() => {
    if (examQ.data && seconds === null) {
      setSeconds(Math.max(1, Number(examQ.data.duration_minutes) || 1) * 60);
    }
  }, [examQ.data, seconds]);

  useEffect(() => {
    if (!started || seconds === null) return;
    if (seconds <= 0) {
      toast.error("Time is up — submitting");
      void finishAttempt(true);
      return;
    }
    const t = setInterval(() => setSeconds((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, seconds === 0]);

  useEffect(() => {
    if (!started) return;
    const onVis = () => {
      if (document.hidden && security.tabMonitoring) {
        setTabSwitches((n) => {
          const next = n + 1;
          if (next >= security.maxTabSwitches) {
            if (security.thresholdAction === "terminate") {
              toast.error("Too many tab switches — exam terminated");
              void finishAttempt(true);
            } else toast.warning("Tab switch limit reached");
          } else toast.warning(`Tab switch (${next}/${security.maxTabSwitches})`);
          return next;
        });
      }
    };
    const blockCopy = (e: ClipboardEvent) => {
      if (security.blockCopyPaste) {
        e.preventDefault();
        toast.message("Copy / paste is disabled");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("copy", blockCopy);
    document.addEventListener("paste", blockCopy);
    document.addEventListener("cut", blockCopy);
    if (security.fullscreen) {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("paste", blockCopy);
      document.removeEventListener("cut", blockCopy);
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, security.fullscreen, security.tabMonitoring, security.blockCopyPaste]);

  useEffect(() => {
    if (!started || !camReady || !streamRef.current) return;
    const video = videoRef.current;
    if (video) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }

    let cancelled = false;
    let detector: { detect: (v: HTMLVideoElement) => Promise<{ boundingBox?: unknown }[]> } | null =
      null;
    try {
      const FD = (window as unknown as { FaceDetector?: new (o?: object) => typeof detector }).FaceDetector;
      if (FD) detector = new FD({ fastMode: true, maxDetectedFaces: 5 }) as typeof detector;
    } catch {
      detector = null;
    }

    const notifyFace = (kind: "none" | "multi") => {
      const now = Date.now();
      if (now - lastFaceToast.current < 8000) return;
      lastFaceToast.current = now;
      if (kind === "none") {
        toast.warning("We can't see your face — look at the camera and stay in frame", {
          duration: 5000,
        });
      } else {
        toast.warning("More than one face detected — only you should be visible", {
          duration: 5000,
        });
      }
    };

    const tick = async () => {
      if (cancelled || !video || video.readyState < 2) return;
      if (!detector) {
        setFaceStatus("unknown");
        return;
      }
      try {
        const faces = await detector.detect(video);
        const n = faces?.length ?? 0;
        if (n === 0) {
          setFaceStatus("none");
          notifyFace("none");
          if (examQ.data && student) {
            void logSecurityEvent({
              schoolId: examQ.data.school_id,
              examId: examQ.data.id,
              attemptId: null,
              studentId: student.studentId,
              eventType: "NO_FACE",
              severity: "medium",
              description: "No face detected in camera feed",
            });
          }
        } else if (n >= 2) {
          setFaceStatus("multi");
          notifyFace("multi");
          if (examQ.data && student) {
            void logSecurityEvent({
              schoolId: examQ.data.school_id,
              examId: examQ.data.id,
              attemptId: null,
              studentId: student.studentId,
              eventType: "MULTIPLE_FACES",
              severity: "high",
              description: `${n} faces detected`,
              extra: { count: n },
            });
          }
        } else {
          setFaceStatus("ok");
        }
      } catch {
        setFaceStatus("unknown");
      }
    };

    const interval = window.setInterval(() => void tick(), 3500);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [started, camReady, examQ.data, student]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const w = window as unknown as { __d4examStream?: MediaStream };
      if (w.__d4examStream) {
        w.__d4examStream.getTracks().forEach((t) => t.stop());
        delete w.__d4examStream;
      }
    };
  }, []);

  function onPipPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = {
      ox: e.clientX,
      oy: e.clientY,
      px: pip.x,
      py: pip.y,
    };
  }
  function onPipPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = dragState.current.ox - e.clientX; // right-origin
    const dy = dragState.current.oy - e.clientY; // bottom-origin
    const nx = Math.max(8, Math.min(window.innerWidth - 160, dragState.current.px + dx));
    const ny = Math.max(8, Math.min(window.innerHeight - 160, dragState.current.py + dy));
    setPip({ x: nx, y: ny });
  }
  function onPipPointerUp() {
    dragState.current = null;
  }

  async function finishAttempt(auto = false) {
    if (!examQ.data || !student) {
      navigate({ to: "/student/examinations" });
      return;
    }
    const status = auto && security.thresholdAction === "terminate" ? "terminated" : "submitted";
    const scored = scoreObjectiveAnswers(questions, answers);
    try {
      await supabase.from("exam_attempts").upsert(
        {
          school_id: examQ.data.school_id,
          exam_id: examQ.data.id,
          student_id: student.studentId,
          status,
          submitted_at: new Date().toISOString(),
          tab_switch_count: tabSwitches,
          answers: answers as never,
          metadata: { auto, answered: Object.keys(answers).length, total: TOTAL, score: scored } as never,
        } as never,
        { onConflict: "exam_id,student_id" },
      );
      const visibility = (
        settingsQ.data?.result_visibility || security.resultVisibility || "after_officer_release"
      ).toLowerCase();
      const resultStatus = visibility === "immediate" ? "published" : "pending";
      await supabase.from("results").upsert(
        {
          school_id: examQ.data.school_id,
          exam_id: examQ.data.id,
          student_id: student.studentId,
          total_score: scored.totalScore,
          percentage: scored.percentage,
          grade: scored.grade,
          pass_fail: scored.passFail,
          correct_count: scored.correct,
          wrong_count: scored.wrong,
          unanswered_count: scored.unanswered,
          status: resultStatus,
          security_review_status: status === "terminated" ? "flagged" : "pending",
          released_at: resultStatus === "published" ? new Date().toISOString() : null,
        } as never,
        { onConflict: "exam_id,student_id" },
      );
    } catch (e) {
      console.warn("finishAttempt", e);
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    toast.success(auto ? "Examination closed" : "Examination submitted successfully");
    setDoneTerminated(status === "terminated");
    setDone(true);
  }

  async function beginWithMedia() {
    setMediaBusy(true);
    try {
      if (student) {
        const { data: existing } = await supabase
          .from("exam_attempts")
          .select("id, status")
          .eq("exam_id", id)
          .eq("student_id", student.studentId)
          .maybeSingle();
        if (existing && ["submitted", "terminated", "flagged"].includes(String(existing.status))) {
          toast.error("You have already completed this examination.");
          setDoneTerminated(String(existing.status) === "terminated");
          setDone(true);
          return;
        }
      }
      const needCam = security.requireCamera;
      const needMic = security.requireMicrophone;
      if (needCam || needMic) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: needCam
              ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
              : false,
            audio: needMic,
          });
          streamRef.current = stream;
          (window as unknown as { __d4examStream?: MediaStream }).__d4examStream = stream;
          setCamReady(Boolean(needCam && stream.getVideoTracks().length > 0));
          toast.success(
            needCam
              ? "Camera on — drag the video if it covers questions"
              : "Microphone access granted",
          );
        } catch {
          toast.error("Allow camera/microphone in your browser, then try again.");
          setMediaBusy(false);
          return;
        }
      }
      if (security.fullscreen) {
        try {
          await document.documentElement.requestFullscreen?.();
        } catch {
          toast.message("Please allow fullscreen");
        }
      }
      setStarted(true);
      setIndex(0);
    } finally {
      setMediaBusy(false);
    }
  }

  if (examQ.isLoading || questionsQ.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading examination…
        </p>
      </div>
    );
  }

  const exam = examQ.data;
  if (!exam) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-bold text-slate-900">Examination not found</p>
          <Button className="mt-4" asChild>
            <Link to="/student/examinations">Back</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!canStartExam(exam.status, exam.scheduled_start) && !done) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-md">
          <p className="font-bold text-slate-900">This examination is not available to start yet</p>
          <Button className="mt-4" asChild>
            <Link to="/student/examinations">Back to exams</Link>
          </Button>
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
          <p className="mt-2 text-sm text-slate-600">
            {doneTerminated
              ? "Your attempt was closed by the security system."
              : "Your answers were submitted successfully. You cannot rewrite this examination."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="font-semibold" asChild>
              <Link to="/student/results">Go to My Results</Link>
            </Button>
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
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Logo size="lg" />
          <h1 className="mt-4 text-xl font-extrabold text-primary">{exam.title}</h1>
          <p className="mt-1 text-sm font-semibold text-primary/80">
            {exam.courses?.code} · {exam.courses?.name}
          </p>
          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            <li>
              Duration: <strong>{exam.duration_minutes} minutes</strong>
            </li>
            <li>
              Questions to answer: <strong>{TOTAL}</strong>
              {questionsToAnswer ? ` (teacher set ${questionsToAnswer})` : ""}
            </li>
            <li>Fullscreen: {security.fullscreen ? "Required" : "Optional"}</li>
            <li className="flex items-center gap-2">
              <Camera className="h-3.5 w-3.5" /> Camera:{" "}
              {security.requireCamera
                ? "Required — live preview (draggable) during the exam"
                : "Not required"}
            </li>
            <li className="flex items-center gap-2">
              <Mic className="h-3.5 w-3.5" /> Microphone:{" "}
              {security.requireMicrophone ? "Required" : "Not required"}
            </li>
          </ul>
          {TOTAL === 0 ? (
            <p className="mt-4 text-sm text-amber-700">
              No questions on this exam paper yet. Contact your teacher.
            </p>
          ) : (
            <Button
              className="mt-6 w-full font-semibold"
              disabled={mediaBusy}
              onClick={() => void beginWithMedia()}
            >
              {mediaBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Requesting permissions…
                </>
              ) : security.requireCamera || security.requireMicrophone ? (
                "Allow camera/mic & start exam"
              ) : (
                "Begin examination"
              )}
            </Button>
          )}
          <Button variant="ghost" className="mt-2 w-full" asChild>
            <Link to="/student/examinations">Cancel</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (TOTAL === 0) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-sm text-slate-600">No questions available.</p>
      </div>
    );
  }

  const mm = String(Math.floor((seconds ?? 0) / 60)).padStart(2, "0");
  const ss = String((seconds ?? 0) % 60).padStart(2, "0");
  const q = questions[index];
  const answeredCount = Object.keys(answers).length;

  const statusFor = (qi: number) => {
    const qid = questions[qi]?.id;
    if (!qid) return "blank";
    if (flagged.has(qid)) return "flagged";
    if (answers[qid] != null) return "answered";
    if (qi === index) return "current";
    return "blank";
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-3 sm:h-[4.5rem] sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="md" wordmark={false} />
            <p className="hidden truncate text-sm font-bold text-primary sm:block sm:text-base">
              {exam.courses?.code ?? "EXAM"} — {exam.title}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {camReady && (
              <span className="hidden items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-200 sm:inline-flex">
                <Camera className="h-3 w-3" /> Cam on
              </span>
            )}
            <span
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-sm font-bold",
                (seconds ?? 0) < 300 ? "bg-red-500 text-white" : "bg-white/10 text-white",
              )}
            >
              {mm}:{ss}
            </span>
            <Button
              size="sm"
              className="rounded-md bg-primary font-semibold hover:bg-primary/90"
              onClick={() => {
                if (confirm(`Submit? Answered ${answeredCount} of ${TOTAL}.`)) void finishAttempt(false);
              }}
            >
              Submit Exam
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1200px] flex-1 gap-4 p-3 pb-28 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="order-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:order-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Questions</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {questions.map((qq, i) => {
              const st = statusFor(i);
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    "grid h-9 place-items-center rounded-md text-xs font-bold transition",
                    st === "current" && "bg-primary text-white ring-2 ring-primary/30",
                    st === "answered" && "bg-emerald-500 text-white",
                    st === "flagged" && "bg-amber-400 text-slate-900",
                    st === "blank" && "border border-slate-200 bg-white text-slate-700 hover:border-primary",
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Answered <span className="font-bold text-slate-800">{answeredCount}</span> / {TOTAL}
          </p>
        </aside>

        <section className="order-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-primary">
              Question <span className="text-primary">{index + 1}</span> of {TOTAL}
            </p>
            <button
              type="button"
              onClick={() => {
                if (!q) return;
                setFlagged((prev) => {
                  const next = new Set(prev);
                  if (next.has(q.id)) next.delete(q.id);
                  else next.add(q.id);
                  return next;
                });
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                q && flagged.has(q.id)
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-slate-200 text-slate-600",
              )}
            >
              <Flag className="h-3.5 w-3.5" />
              {q && flagged.has(q.id) ? "Marked" : "Mark for Review"}
            </button>
          </div>

          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q?.question_text}</h1>

          <ul className="mt-6 space-y-3">
            {(q?.options ?? []).map((opt, oi) => {
              const selected = q ? answers[q.id] === oi : false;
              return (
                <li key={`${q?.id}-${oi}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!q) return;
                      setAnswers((prev) => ({ ...prev, [q.id]: oi }));
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
                      selected
                        ? "border-primary bg-blue-50 text-slate-900 ring-1 ring-primary/30"
                        : "border-slate-200 bg-white text-slate-700 hover:border-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold",
                        selected ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-500",
                      )}
                    >
                      {String.fromCharCode(65 + oi)}
                    </span>
                    <span>{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <Button
              variant="outline"
              className="rounded-lg font-semibold"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button
              className="rounded-lg font-semibold"
              disabled={index >= TOTAL - 1}
              onClick={() => setIndex((i) => Math.min(TOTAL - 1, i + 1))}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>

      {/* Draggable live camera PIP — always visible, never blocks by default if moved */}
      {camReady && (
        <div
          className="fixed z-50 w-[132px] touch-none overflow-hidden rounded-xl border-2 border-primary bg-black shadow-2xl sm:w-[168px]"
          style={{ right: pip.x, bottom: pip.y }}
          onPointerDown={onPipPointerDown}
          onPointerMove={onPipPointerMove}
          onPointerUp={onPipPointerUp}
          onPointerCancel={onPipPointerUp}
        >
          <div className="flex cursor-grab items-center gap-1 bg-primary/90 px-2 py-0.5 active:cursor-grabbing">
            <GripVertical className="h-3 w-3 text-white" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-white">Drag me</span>
          </div>
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full object-cover"
            autoPlay
            playsInline
            muted
          />
          <div
            className={cn(
              "px-2 py-1 text-center text-[10px] font-bold text-white",
              faceStatus === "multi" && "bg-red-600",
              faceStatus === "none" && "bg-amber-600",
              faceStatus === "ok" && "bg-emerald-600",
              faceStatus === "unknown" && "bg-primary",
            )}
          >
            {faceStatus === "multi"
              ? "Multiple faces"
              : faceStatus === "none"
                ? "Face not seen"
                : faceStatus === "ok"
                  ? "Monitoring · 1 face"
                  : "Live camera"}
          </div>
        </div>
      )}
    </div>
  );
}
