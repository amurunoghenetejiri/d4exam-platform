import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Flag,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Camera,
  Wifi,
  Monitor,
  AlertTriangle,
  Eraser,
} from "lucide-react";
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
import { parseExamMeta, pickExamQuestions, seededShuffle } from "@/lib/exam-meta";
import { logSecurityEvent, scoreObjectiveAnswers } from "@/lib/cbt-security";
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

type Phase = "check" | "ready" | "exam" | "done";

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

function CbtExamPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: student } = useStudentContext();

  const [phase, setPhase] = useState<Phase>("check");
  const [checkNotes, setCheckNotes] = useState<string[]>([]);
  const [checkOk, setCheckOk] = useState(false);
  const [checking, setChecking] = useState(true);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [fsExits, setFsExits] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [faceLabel, setFaceLabel] = useState<string>("Camera idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const savingRef = useRef(false);
  const finishedRef = useRef(false);

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
      try {
        const { data, error } = await supabase
          .from("exam_settings")
          .select(
            "exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, threshold_action, total_marks, instructions, result_visibility, max_fullscreen_exits, warning_threshold",
          )
          .eq("exam_id", id)
          .maybeSingle();
        if (error) return null;
        return data as (ExamSettingsRow & {
          max_fullscreen_exits?: number;
          warning_threshold?: number;
        }) | null;
      } catch {
        return null;
      }
    },
  });

  const bankQ = useQuery({
    queryKey: ["cbt-bank", id, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.id),
    queryFn: async () => {
      const exam = examQ.data!;
      try {
        const { data: links, error: linkErr } = await supabase
          .from("exam_questions")
          .select(
            "question_order, questions(id, question_text, question_type, marks, correct_answer, explanation)",
          )
          .eq("exam_id", exam.id)
          .order("question_order");
        if (!linkErr) {
          const fromPaper = ((links ?? []) as { questions: QRow | null }[])
            .map((l) => l.questions)
            .filter(Boolean) as QRow[];
          if (fromPaper.length) return fromPaper;
        }
      } catch {
        /* empty */
      }

      if (!exam.course_id) return [] as QRow[];
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation, status")
        .eq("school_id", exam.school_id)
        .eq("course_id", exam.course_id)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) {
        console.error("CBT bank load error", error);
        throw error;
      }
      const rows = (data ?? []) as (QRow & { status?: string })[];
      const preferred = rows.filter((r) =>
        ["active", "approved"].includes((r.status || "active").toLowerCase()),
      );
      return (preferred.length ? preferred : rows.filter((r) => (r.status || "") !== "archived")) as QRow[];
    },
  });

  const security = useMemo(() => {
    const fromTable = fromExamSettingsRow(settingsQ.data);
    if (settingsQ.data) return fromTable;
    return parseSecurityFromDescription(examQ.data?.description) ?? fromTable;
  }, [settingsQ.data, examQ.data?.description]);

  const maxTab = settingsQ.data?.max_tab_switches ?? security.maxTabSwitches ?? 5;
  const maxFs =
    (settingsQ.data as { max_fullscreen_exits?: number } | null)?.max_fullscreen_exits ?? 3;

  const meta = useMemo(() => parseExamMeta(examQ.data?.description), [examQ.data?.description]);

  const questions = useMemo(() => {
    const bank = (bankQ.data ?? []).map((q) => {
      const opts = decodeOptions(q.explanation);
      if (opts.length === 0 && q.question_type === "true_false") {
        return { ...q, options: ["True", "False"] };
      }
      return {
        ...q,
        options: opts.length ? opts : ["Option A", "Option B", "Option C", "Option D"],
      };
    });
    const studentKey = student?.studentId ?? student?.matric ?? "anon";
    const examId = examQ.data?.id ?? id;
    let picked = pickExamQuestions(bank, {
      questionsToAnswer: meta.questionsToAnswer,
      randomize: security.randomizeQuestions,
      studentKey,
      examId,
    });
    if (security.randomizeOptions) {
      picked = picked.map((q) => ({
        ...q,
        options: seededShuffle(q.options, `${examId}:${studentKey}:opts:${q.id}`),
      }));
    }
    return picked;
  }, [
    bankQ.data,
    security.randomizeQuestions,
    security.randomizeOptions,
    meta.questionsToAnswer,
    student?.studentId,
    student?.matric,
    examQ.data?.id,
    id,
  ]);

  const TOTAL = questions.length;
  const currentQ = questions[index];

  useEffect(() => {
    let cancelled = false;
    async function runChecks() {
      setChecking(true);
      const notes: string[] = [];
      let ok = true;

      if (!student) {
        notes.push("Student profile not linked.");
        ok = false;
      } else {
        notes.push("Student eligibility: profile found.");
      }

      if (!navigator.onLine) {
        notes.push("Internet: offline.");
        ok = false;
      } else {
        notes.push("Internet: online.");
      }

      notes.push(`Browser: ${navigator.userAgent.slice(0, 80)}…`);

      if (security.requireCamera) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          if (!cancelled) {
            setCameraStream(stream);
            notes.push("Camera: permission granted.");
          } else {
            stream.getTracks().forEach((t) => t.stop());
          }
        } catch {
          notes.push("Camera: permission denied or unavailable.");
          ok = false;
        }
      } else {
        notes.push("Camera: not required.");
      }

      if (security.requireMicrophone) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          stream.getTracks().forEach((t) => t.stop());
          notes.push("Microphone: permission granted.");
        } catch {
          notes.push("Microphone: permission denied or unavailable.");
          ok = false;
        }
      } else {
        notes.push("Microphone: not required.");
      }

      if (!cancelled) {
        setCheckNotes(notes);
        setCheckOk(ok);
        setChecking(false);
        if (ok) setPhase("ready");
      }
    }
    if (examQ.data && student !== undefined) void runChecks();
    return () => {
      cancelled = true;
    };
  }, [examQ.data?.id, student?.studentId, security.requireCamera, security.requireMicrophone]);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      void videoRef.current.play().catch(() => {});
    }
  }, [cameraStream, phase]);

  useEffect(() => {
    if ((phase !== "exam" && phase !== "ready") || !cameraStream) return;
    let alive = true;
    let lastLogged = "";
    const FaceDetectorCtor = (
      window as unknown as {
        FaceDetector?: new (opts?: { maxDetectedFaces?: number; fastMode?: boolean }) => {
          detect: (s: HTMLVideoElement) => Promise<{ boundingBox: unknown }[]>;
        };
      }
    ).FaceDetector;

    if (!FaceDetectorCtor) {
      setFaceLabel("Camera on · face count API not in this browser");
      return;
    }

    let detector: { detect: (s: HTMLVideoElement) => Promise<{ boundingBox: unknown }[]> };
    try {
      detector = new FaceDetectorCtor({ maxDetectedFaces: 5, fastMode: true });
    } catch {
      setFaceLabel("Camera on · face detector failed to start");
      return;
    }

    const tick = async () => {
      if (!alive || !videoRef.current) return;
      if (videoRef.current.readyState < 2) return;
      try {
        const faces = await detector.detect(videoRef.current);
        if (!alive) return;
        if (faces.length === 0) {
          setFaceLabel("No face detected");
          if (phase === "exam" && lastLogged !== "NO_FACE") {
            lastLogged = "NO_FACE";
            void logEvent("NO_FACE", "medium", "No face detected in camera frame");
          }
        } else if (faces.length === 1) {
          setFaceLabel("One face detected · OK");
          lastLogged = "ONE_FACE";
        } else {
          setFaceLabel(`Multiple faces (${faces.length}) · recorded`);
          if (phase === "exam" && lastLogged !== "MULTI") {
            lastLogged = "MULTI";
            void logEvent("MULTIPLE_FACES", "high", `${faces.length} faces detected`);
          }
        }
      } catch {
        setFaceLabel("Camera on · scanning…");
      }
    };

    void tick();
    const iv = setInterval(() => void tick(), 3000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [phase, cameraStream]);

  const logEvent = useCallback(
    async (
      type: string,
      severity: "low" | "medium" | "high" = "low",
      description?: string,
    ) => {
      if (!examQ.data || !student) return;
      await logSecurityEvent({
        schoolId: examQ.data.school_id,
        examId: examQ.data.id,
        attemptId,
        studentId: student.studentId,
        eventType: type,
        severity,
        description,
        questionId: currentQ?.id ?? null,
        questionIndex: index + 1,
      });
    },
    [examQ.data, student, attemptId, currentQ?.id, index],
  );

  const persistAnswers = useCallback(
    async (nextAnswers: Record<string, number>, extra?: Record<string, unknown>) => {
      if (!attemptId || savingRef.current) return;
      savingRef.current = true;
      try {
        await supabase
          .from("exam_attempts")
          .update({
            answers: nextAnswers as never,
            tab_switch_count: tabSwitches,
            fullscreen_exit_count: fsExits,
            metadata: { flagged: [...flagged], ...(extra ?? {}) } as never,
            status: "in_progress",
          } as never)
          .eq("id", attemptId);
      } catch {
      } finally {
        savingRef.current = false;
      }
    },
    [attemptId, tabSwitches, fsExits, flagged],
  );

  const finishAttempt = useCallback(
    async (auto = false, reason = "submitted") => {
      if (finishedRef.current || !examQ.data || !student) return;
      finishedRef.current = true;
      const scoring = scoreObjectiveAnswers(questions, answers);
      const status =
        reason === "terminated" || (auto && security.thresholdAction === "terminate")
          ? "terminated"
          : "submitted";
      try {
        if (attemptId) {
          await supabase
            .from("exam_attempts")
            .update({
              status,
              submitted_at: new Date().toISOString(),
              terminated_at: status === "terminated" ? new Date().toISOString() : null,
              answers: answers as never,
              tab_switch_count: tabSwitches,
              fullscreen_exit_count: fsExits,
              objective_score: scoring.totalScore,
              total_score: scoring.totalScore,
              metadata: {
                auto,
                reason,
                scoring,
                questionIds: questions.map((q) => q.id),
              } as never,
            } as never)
            .eq("id", attemptId);
        }
        await supabase.from("results").upsert(
          {
            school_id: examQ.data.school_id,
            exam_id: examQ.data.id,
            student_id: student.studentId,
            attempt_id: attemptId,
            objective_score: scoring.totalScore,
            total_score: scoring.totalScore,
            percentage: scoring.percentage,
            grade: scoring.grade,
            pass_fail: scoring.passFail,
            correct_count: scoring.correct,
            wrong_count: scoring.wrong,
            unanswered_count: scoring.unanswered,
            status: "pending",
            security_review_status: "pending",
          } as never,
          { onConflict: "exam_id,student_id" },
        );
        await logEvent(auto ? "AUTO_SUBMIT" : "MANUAL_SUBMIT", "low", reason);
      } catch (e) {
        console.warn(e);
      }
      cameraStream?.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      toast.success(auto ? "Examination closed" : "Examination submitted");
      setPhase("done");
      navigate({ to: "/student/examinations" });
    },
    [
      examQ.data,
      student,
      attemptId,
      questions,
      answers,
      tabSwitches,
      fsExits,
      security.thresholdAction,
      cameraStream,
      logEvent,
      navigate,
    ],
  );

  useEffect(() => {
    if (phase !== "exam" || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      toast.error("Time is up — submitting");
      void finishAttempt(true, "time_up");
      return;
    }
    if (secondsLeft === 300) toast.warning("5 minutes remaining");
    if (secondsLeft === 60) toast.warning("1 minute remaining");
    const t = setInterval(() => setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [phase, secondsLeft, finishAttempt]);

  useEffect(() => {
    if (phase !== "exam") return;
    const showWarn = (msg: string) => {
      setBanner(msg);
      toast.warning(msg);
      setTimeout(() => setBanner(null), 5000);
    };
    const onVis = () => {
      if (document.hidden && security.tabMonitoring) {
        setTabSwitches((n) => {
          const next = n + 1;
          void logEvent(
            "TAB_SWITCH",
            next >= maxTab ? "high" : "medium",
            `TAB_SWITCH — ${new Date().toLocaleTimeString()} — Question ${index + 1}`,
          );
          showWarn("Warning: Leaving the examination window has been recorded.");
          if (next >= maxTab) {
            if (security.thresholdAction === "terminate") void finishAttempt(true, "terminated");
            else if (security.thresholdAction === "flag")
              toast.warning("Tab switch limit reached — attempt will be flagged for review");
          }
          return next;
        });
      }
    };
    const onFs = () => {
      if (!document.fullscreenElement && security.fullscreen) {
        setFsExits((n) => {
          const next = n + 1;
          void logEvent("FULLSCREEN_EXIT", "medium", `Fullscreen exit #${next}`);
          showWarn("Warning: Fullscreen exit has been recorded.");
          if (next >= maxFs && security.thresholdAction === "terminate")
            void finishAttempt(true, "terminated");
          void document.documentElement.requestFullscreen?.().catch(() => {});
          return next;
        });
      }
    };
    const blockClip = (e: ClipboardEvent) => {
      if (!security.blockCopyPaste) return;
      e.preventDefault();
      const type =
        e.type === "copy" ? "COPY_ATTEMPT" : e.type === "cut" ? "CUT_ATTEMPT" : "PASTE_ATTEMPT";
      void logEvent(type, "medium", `${type} on question ${index + 1}`);
      showWarn("Copying examination content is not allowed. This action has been recorded.");
    };
    const blockKeys = (e: KeyboardEvent) => {
      if (!security.blockCopyPaste) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "v", "a"].includes(key)) {
        e.preventDefault();
        void logEvent("COPY_ATTEMPT", "medium", `Shortcut Ctrl/Cmd+${key.toUpperCase()}`);
        showWarn("Copying examination content is not allowed. This action has been recorded.");
      }
    };
    const blockContext = (e: MouseEvent) => {
      if (!security.blockCopyPaste) return;
      e.preventDefault();
      void logEvent("CONTEXT_MENU", "low", "Right-click blocked");
    };
    const onOnline = () => {
      void logEvent("CONNECTION_RESTORED", "low");
      toast.success("Connection restored — answers auto-saved");
      void persistAnswers(answers);
    };
    const onOffline = () => {
      void logEvent("CONNECTION_LOST", "medium");
      toast.error("Connection lost — keep this tab open");
    };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("copy", blockClip);
    document.addEventListener("cut", blockClip);
    document.addEventListener("paste", blockClip);
    document.addEventListener("keydown", blockKeys);
    document.addEventListener("contextmenu", blockContext);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (security.fullscreen) {
      void document.documentElement.requestFullscreen?.().catch(() => {
        toast.message("Please allow fullscreen for this examination");
      });
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("copy", blockClip);
      document.removeEventListener("cut", blockClip);
      document.removeEventListener("paste", blockClip);
      document.removeEventListener("keydown", blockKeys);
      document.removeEventListener("contextmenu", blockContext);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [phase, security, maxTab, maxFs, index, logEvent, finishAttempt, persistAnswers, answers]);

  async function beginExam() {
    if (!examQ.data || !student || TOTAL === 0) return;
    try {
      const endsAt = new Date(
        Date.now() + Math.max(1, examQ.data.duration_minutes) * 60 * 1000,
      ).toISOString();
      const { data: existing } = await supabase
        .from("exam_attempts")
        .select("id, answers, status, ends_at, tab_switch_count, fullscreen_exit_count, metadata")
        .eq("exam_id", examQ.data.id)
        .eq("student_id", student.studentId)
        .maybeSingle();
      if (existing && ["submitted", "terminated"].includes(existing.status)) {
        toast.error("You have already submitted this examination.");
        return;
      }
      let aid = existing?.id as string | undefined;
      if (existing?.id) {
        await supabase
          .from("exam_attempts")
          .update({
            status: "in_progress",
            started_at: new Date().toISOString(),
            ends_at: existing.ends_at ?? endsAt,
            question_order: questions.map((q) => q.id) as never,
          } as never)
          .eq("id", existing.id);
        if (existing.answers && typeof existing.answers === "object") {
          setAnswers(existing.answers as Record<string, number>);
        }
        setTabSwitches(existing.tab_switch_count ?? 0);
        setFsExits((existing as { fullscreen_exit_count?: number }).fullscreen_exit_count ?? 0);
        const endMs = existing.ends_at
          ? new Date(existing.ends_at).getTime()
          : new Date(endsAt).getTime();
        setSecondsLeft(Math.max(1, Math.floor((endMs - Date.now()) / 1000)));
      } else {
        const { data: created, error } = await supabase
          .from("exam_attempts")
          .insert({
            school_id: examQ.data.school_id,
            exam_id: examQ.data.id,
            student_id: student.studentId,
            status: "in_progress",
            started_at: new Date().toISOString(),
            ends_at: endsAt,
            answers: {} as never,
            question_order: questions.map((q) => q.id) as never,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        aid = created.id as string;
        setSecondsLeft(Math.max(1, examQ.data.duration_minutes) * 60);
      }
      setAttemptId(aid ?? null);
      await logEvent("SECURITY_CHECK_PASSED", "low", "Student entered CBT");
      setPhase("exam");
      setIndex(0);
    } catch (err) {
      toast.error((err as Error).message || "Could not start examination");
    }
  }

  function selectOption(opt: number) {
    if (!currentQ) return;
    const next = { ...answers, [currentQ.id]: opt };
    setAnswers(next);
    void persistAnswers(next);
  }
  function clearAnswer() {
    if (!currentQ) return;
    const next = { ...answers };
    delete next[currentQ.id];
    setAnswers(next);
    void persistAnswers(next);
  }
  function toggleFlag() {
    if (!currentQ) return;
    setFlagged((prev) => {
      const n = new Set(prev);
      if (n.has(currentQ.id)) n.delete(currentQ.id);
      else n.add(currentQ.id);
      return n;
    });
  }

  if (examQ.isLoading || bankQ.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading secure exam environment…
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

  if (!canStartExam(exam.status, exam.scheduled_start)) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-md">
          <p className="font-bold text-slate-900">This examination is not available to start yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Status: {exam.status.replaceAll("_", " ")}
            {exam.scheduled_start
              ? ` · Starts ${new Date(exam.scheduled_start).toLocaleString()}`
              : ""}
          </p>
          <Button className="mt-4" asChild>
            <Link to="/student/examinations">Back to exams</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "check" || phase === "ready") {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4 sm:p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Logo size="sm" />
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">Secure CBT Environment</h1>
          <p className="mt-1 text-sm text-slate-500">
            {exam.courses?.code} · {exam.title}
          </p>
          <div className="mt-5 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-slate-800">
              <ShieldCheck className="h-4 w-4 text-primary" /> Security check
            </p>
            {checking ? (
              <p className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Running checks…
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs text-slate-600">
                {checkNotes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="text-primary">•</span> {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-slate-400" /> Duration: {exam.duration_minutes} min
            </li>
            <li className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-slate-400" /> Questions: {TOTAL}
              {bankQ.isError && (
                <span className="text-xs font-semibold text-red-600">
                  (bank blocked — run student questions RLS SQL)
                </span>
              )}
              {!bankQ.isError && TOTAL === 0 && !bankQ.isLoading && (
                <span className="text-xs font-semibold text-amber-700">
                  (no questions linked to this exam course yet)
                </span>
              )}
            </li>
            <li className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-slate-400" />
              Camera: {security.requireCamera ? "Required" : "Not required"}
            </li>
          </ul>
          {cameraStream && (
            <div className="mt-4 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
              <video ref={videoRef} muted playsInline className="h-32 w-full object-cover" />
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <p className="text-[11px] font-semibold text-emerald-900">{faceLabel}</p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    faceLabel.startsWith("One face")
                      ? "bg-emerald-600 text-white"
                      : faceLabel.startsWith("No face")
                        ? "bg-amber-500 text-white"
                        : faceLabel.startsWith("Multiple")
                          ? "bg-red-600 text-white"
                          : "bg-slate-600 text-white",
                  )}
                >
                  {faceLabel.startsWith("One face")
                    ? "OK"
                    : faceLabel.startsWith("No face")
                      ? "No face"
                      : faceLabel.startsWith("Multiple")
                        ? "Multi"
                        : "Live"}
                </span>
              </div>
              <p className="border-t border-emerald-100 px-3 py-1.5 text-[10px] text-emerald-800">
                Face presence is logged for officer review only — it does not auto-fail the exam.
              </p>
            </div>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Browser-level protections reduce risk of copy/paste and window switching. They do not
            provide absolute protection against screenshots, external devices, or every workaround.
          </p>
          {!checking && !checkOk && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Security check failed. Fix the issues above and reload.
            </p>
          )}
          <Button
            className="mt-5 w-full font-semibold"
            disabled={checking || !checkOk || TOTAL === 0}
            onClick={() => void beginExam()}
          >
            Enter fullscreen & begin
          </Button>
          <Button variant="ghost" className="mt-2 w-full" asChild>
            <Link to="/student/examinations">Cancel</Link>
          </Button>
        </div>
      </div>
    );
  }

  const mm = String(Math.floor((secondsLeft ?? 0) / 60)).padStart(2, "0");
  const ss = String((secondsLeft ?? 0) % 60).padStart(2, "0");
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
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-slate-50",
        security.blockCopyPaste && "select-none",
      )}
    >
      {banner && (
        <div className="bg-amber-500 px-3 py-2 text-center text-sm font-semibold text-white">
          {banner}
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="sm" className="[&_span]:text-white" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-bold">
                {exam.courses?.code ?? "EXAM"} — {exam.title}
              </p>
              <p className="text-[10px] text-slate-300">
                Tabs {tabSwitches}/{maxTab} · FS exits {fsExits}/{maxFs}
                {security.requireCamera ? ` · ${faceLabel}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-sm font-bold",
                (secondsLeft ?? 0) < 300 ? "bg-red-500 text-white" : "bg-white/10 text-white",
              )}
            >
              {mm}:{ss}
            </span>
            <Button
              size="sm"
              className="rounded-md bg-primary font-semibold"
              onClick={() => {
                if (
                  confirm(
                    `Submit examination? Answered ${answeredCount} of ${TOTAL}. This cannot be undone.`,
                  )
                )
                  void finishAttempt(false, "manual");
              }}
            >
              Submit Exam
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-[1200px] flex-1 gap-4 p-3 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="order-2 space-y-3 lg:order-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                      st === "blank" &&
                        "border border-slate-200 bg-white text-slate-700 hover:border-primary",
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
          </div>
          {cameraStream && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <video ref={videoRef} muted playsInline className="h-28 w-full object-cover" />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <p className="text-[10px] font-semibold text-slate-700">{faceLabel}</p>
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    faceLabel.startsWith("One face")
                      ? "bg-emerald-500"
                      : faceLabel.startsWith("No face")
                        ? "bg-amber-500"
                        : faceLabel.startsWith("Multiple")
                          ? "bg-red-500"
                          : "bg-slate-400",
                  )}
                />
              </div>
            </div>
          )}
        </aside>
        <section className="order-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">
          {currentQ && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-500">
                  Question <span className="text-slate-900">{index + 1}</span> of {TOTAL}
                  <span className="ml-2 text-xs text-slate-400">· {currentQ.marks} mark(s)</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={clearAnswer}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Eraser className="h-3.5 w-3.5" /> Clear
                  </button>
                  <button
                    type="button"
                    onClick={toggleFlag}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                      flagged.has(currentQ.id)
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    {flagged.has(currentQ.id) ? "Marked" : "Mark for Review"}
                  </button>
                </div>
              </div>
              <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                {currentQ.question_text}
              </h1>
              <ul className="mt-6 space-y-3">
                {currentQ.options.map((opt, oi) => {
                  const selected = answers[currentQ.id] === oi;
                  return (
                    <li key={`${currentQ.id}-${oi}`}>
                      <button
                        type="button"
                        onClick={() => selectOption(oi)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
                          selected
                            ? "border-primary bg-blue-50 text-slate-900 ring-1 ring-primary/30"
                            : "border-slate-200 bg-white text-slate-700 hover:border-primary/40 hover:bg-slate-50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold",
                            selected
                              ? "border-primary bg-primary text-white"
                              : "border-slate-300 text-slate-500",
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
                  disabled={index === 0}
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                </Button>
                <Button
                  disabled={index >= TOTAL - 1}
                  onClick={() => setIndex((i) => Math.min(TOTAL - 1, i + 1))}
                >
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
