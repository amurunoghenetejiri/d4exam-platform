import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
import { ExamCameraPip } from "@/components/cbt/ExamCameraPip";
import { saveCbtResult } from "@/lib/cbt-save-result";

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
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

export function CbtExamPage() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ?? "";
  const navigate = useNavigate();
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
  const attemptIdRef = useRef<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

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

  useEffect(() => {
    if (previewMode || !student?.studentId || !id) return;
    void (async () => {
      const { data } = await supabase.from("exam_attempts").select("id, status")
        .eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
      if (data && ["submitted", "terminated", "flagged"].includes(String(data.status))) {
        setDoneTerminated(String(data.status) === "terminated");
        setDone(true);
      }
    })();
  }, [previewMode, student?.studentId, id]);

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
    if (!started || done || !security.fullscreen) return;
    const ensureFs = () => {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    ensureFs();
    const onFsChange = () => {
      if (!document.fullscreenElement && started && !done) {
        toast.message("Fullscreen is required for this examination");
        void document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [started, done, security.fullscreen]);

  useEffect(() => {
    if (!started || done || seconds == null) return;
    if (seconds <= 0) { void finishAttempt(true); return; }
    const t = window.setInterval(() => setSeconds((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(t);
  }, [started, done, seconds === 0]);

  useEffect(() => {
    return () => {
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
    };
  }, []);

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
      picked = picked.map((q: { id: string; options: string[] }) => ({ ...q, options: seededShuffle(q.options, `${id}:${key}:${q.id}:opts`) }));
    }
    return picked as Array<{ id: string; question_text: string; marks: number; correct_answer: string | null; options: string[] }>;
  }, [questionsQ.data, questionsToAnswer, security.randomizeQuestions, security.randomizeOptions, student?.studentId, session?.userId, previewMode, id]);

  const TOTAL = questions.length;
  const q = questions[index];
  const answeredCount = Object.keys(answers).length;

  function shutdownMedia() {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
  }

  async function finishAttempt(auto = false) {
    if (done) return;
    shutdownMedia();
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});

    if (previewMode) {
      toast.message("Preview ended — nothing was saved");
      setDone(true);
      return;
    }
    try {
      if (student?.studentId && examQ.data) {
        let attemptId = attemptIdRef.current;
        if (!attemptId) {
          const { data } = await supabase
            .from("exam_attempts")
            .upsert(
              {
                exam_id: id,
                student_id: student.studentId,
                school_id: examQ.data.school_id,
                status: "in_progress",
                started_at: new Date().toISOString(),
                answers,
              } as never,
              { onConflict: "exam_id,student_id" },
            )
            .select("id")
            .maybeSingle();
          attemptId = (data?.id as string) ?? null;
          attemptIdRef.current = attemptId;
        }

        const schoolId = String(examQ.data.school_id ?? student.schoolId ?? "");
        const saved = await saveCbtResult({
          examId: id,
          studentId: student.studentId,
          schoolId,
          attemptId,
          questions: questions.map((qq) => ({
            id: qq.id,
            marks: qq.marks ?? 1,
            correct_answer: qq.correct_answer,
            options: qq.options ?? [],
          })),
          answers,
          terminated: auto,
          resultVisibility: security.resultVisibility,
        });

        if (saved.error) {
          toast.error(saved.error.message);
        } else {
          if (saved.resultId) setResultId(saved.resultId);
          if (saved.published) {
            toast.success("Examination submitted — result is available now");
          } else {
            toast.success(
              auto
                ? "Examination closed"
                : "Examination submitted successfully. Result will appear when released by the officer.",
            );
          }
        }
      } else {
        toast.success(auto ? "Examination closed" : "Examination submitted successfully");
      }
    } catch (e) {
      toast.error(friendlyError(e, "Could not save result"));
    }
    setDoneTerminated(auto);
    setDone(true);
  }

  async function beginWithMedia(_opts: { skipScreenShare: boolean; caps: DeviceCapabilities }) {
    setMediaBusy(true);
    try {
      if (!previewMode && student?.studentId) {
        const { data: existing } = await supabase.from("exam_attempts").select("id, status")
          .eq("exam_id", id).eq("student_id", student.studentId).maybeSingle();
        if (existing && ["submitted", "terminated", "flagged"].includes(String(existing.status))) {
          toast.error("You have already completed this examination.");
          setDone(true);
          return;
        }
        if (existing?.id) attemptIdRef.current = existing.id as string;
      }
      if (security.requireCamera) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: Boolean(security.requireMicrophone),
          });
          stopMediaStream(mediaStreamRef.current);
          mediaStreamRef.current = stream;
          toast.success("Camera ready");
        } catch {
          toast.error("Camera is required for this examination.");
          return;
        }
      }
      if (security.fullscreen) {
        try {
          const el = document.documentElement;
          if (!document.fullscreenElement && el.requestFullscreen) {
            await el.requestFullscreen();
          }
        } catch {
          toast.message("Please allow fullscreen to continue the exam");
        }
      }
      setSeconds((examQ.data?.duration_minutes ?? 60) * 60);
      setStarted(true);
      setIndex(0);
    } finally {
      setMediaBusy(false);
    }
  }

  function goToResult() {
    const targetId = resultId || id;
    void navigate({ to: "/student/results/$id", params: { id: targetId } });
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
            {previewMode ? "Officer preview finished — nothing was saved." : doneTerminated ? "Your attempt was closed by the security system. You cannot rewrite this examination." : "Your answers were submitted successfully. You cannot rewrite this examination."}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {!previewMode && (
              <Button className="font-semibold" onClick={goToResult}>
                View Results
              </Button>
            )}
            <Button variant="outline" className="font-semibold" asChild>
              <Link to={previewMode ? "/officer/approvals" : "/student/examinations"}>{previewMode ? "Back to approvals" : "Back to examinations"}</Link>
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
        windowLabel={previewMode ? "Officer interactive preview · identical security to students" : formatExamWindow(exam.scheduled_start, exam.scheduled_end)}
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
    <div className="flex min-h-dvh flex-col bg-slate-50 select-none">
      {previewMode && (
        <div className="bg-amber-500 px-3 py-1.5 text-center text-xs font-bold text-white">
          OFFICER PREVIEW — same security as students · answers are not saved
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SchoolLogo logoUrl={schoolBrand?.logoUrl ?? session?.schoolLogoUrl} schoolName={schoolBrand?.name ?? student?.schoolName ?? session?.schoolName} size="md" className="bg-transparent" />
            <p className="hidden truncate text-sm font-bold sm:block">{(exam as { courses?: { code?: string } }).courses?.code ?? "EXAM"} — {exam.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm font-bold tabular-nums">{mm}:{ss}</div>
            <Button size="sm" variant="secondary" className="font-semibold" onClick={() => void finishAttempt(false)}>Submit</Button>
          </div>
        </div>
      </header>
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
          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q?.question_text}</h1>
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
      {started && !done && security.requireCamera && (
        <ExamCameraPip
          enabled={started && !done}
          faceDetection={Boolean(security.faceDetection)}
          maxFaceWarnings={security.maxFaceWarnings ?? 3}
          stream={mediaStreamRef.current}
        />
      )}
    </div>
  );
}

export { CbtExamPage as CbtExamSession };
