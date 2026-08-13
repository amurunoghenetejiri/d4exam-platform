import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
import { scoreObjectiveAnswers } from "@/lib/cbt-security";
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

function CbtExamPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: student } = useStudentContext();

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
          "exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, randomize_questions, randomize_options, require_camera, require_microphone, threshold_action, total_marks, instructions, result_visibility",
        )
        .eq("exam_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as ExamSettingsRow | null;
    },
  });

  const questionsQ = useQuery({
    queryKey: ["cbt-questions", examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.course_id && examQ.data?.school_id),
    queryFn: async () => {
      const exam = examQ.data!;
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation")
        .eq("school_id", exam.school_id)
        .eq("course_id", exam.course_id!)
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

  const examMeta = useMemo(
    () => parseExamMeta(examQ.data?.description),
    [examQ.data?.description],
  );

  const questions = useMemo(() => {
    const bank = (questionsQ.data ?? []).map((q) => {
      const opts = decodeOptions(q.explanation);
      if (opts.length === 0 && (q.question_type === "true_false" || q.question_type === "True/False")) {
        return { ...q, options: ["True", "False"] };
      }
      return {
        ...q,
        options: opts.length ? opts : ["Option A", "Option B", "Option C", "Option D"],
      };
    });
    const limited = pickExamQuestions(bank, {
      questionsToAnswer: examMeta.questionsToAnswer,
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
    examMeta.questionsToAnswer,
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
            } else if (security.thresholdAction === "flag") {
              toast.warning("Tab switch limit reached — attempt flagged");
            } else {
              toast.warning("Stay on the exam window");
            }
          } else {
            toast.warning(`Tab switch detected (${next}/${security.maxTabSwitches})`);
          }
          return next;
        });
      }
    };
    const blockCopy = (e: ClipboardEvent) => {
      if (security.blockCopyPaste) {
        e.preventDefault();
        toast.message("Copy / paste is disabled for this exam");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("copy", blockCopy);
    document.addEventListener("paste", blockCopy);
    document.addEventListener("cut", blockCopy);
    if (security.fullscreen) {
      void document.documentElement.requestFullscreen?.().catch(() => {
        toast.message("Please allow fullscreen for this examination");
      });
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

  async function finishAttempt(auto = false) {
    if (!examQ.data || !student) {
      navigate({ to: "/student/examinations" });
      return;
    }
    const status =
      auto && security.thresholdAction === "terminate" ? "terminated" : "submitted";
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
          metadata: {
            auto,
            answered: Object.keys(answers).length,
            total: TOTAL,
            score: scored,
          } as never,
        } as never,
        { onConflict: "exam_id,student_id" },
      );
      const visibility = (
        settingsQ.data?.result_visibility ||
        security.resultVisibility ||
        "after_officer_release"
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
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    toast.success(auto ? "Examination closed" : "Examination submitted successfully");
    setDoneTerminated(status === "terminated");
    setDone(true);
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

  if (done) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-4 sm:p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Logo size="sm" className="mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Examination completed</h1>
          <p className="mt-2 text-sm text-slate-600">
            {doneTerminated
              ? "Your attempt was closed by the security system."
              : "Your answers were submitted successfully. You cannot rewrite this examination."}
          </p>
          <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-bold">Result status</p>
            <p className="mt-1">
              {(settingsQ.data?.result_visibility || security.resultVisibility) === "immediate"
                ? "Your score is available now in My Results."
                : "Your result is pending approval. It will appear after the Examination Officer releases it."}
            </p>
          </div>
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
          <Logo size="sm" />
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">{exam.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {exam.courses?.code} · {exam.courses?.name}
          </p>
          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            <li>
              Duration: <strong>{exam.duration_minutes} minutes</strong> (teacher setting)
            </li>
            <li>
              Questions: <strong>{TOTAL}</strong>
              {examMeta.questionsToAnswer
                ? ` (teacher set ${examMeta.questionsToAnswer})`
                : ""}
            </li>
            <li>Fullscreen: {security.fullscreen ? "Required" : "Optional"}</li>
            <li>
              Camera: {security.requireCamera ? "Required" : "Off"} · Mic:{" "}
              {security.requireMicrophone ? "Required" : "Off"}
            </li>
            <li>
              Tab monitoring:{" "}
              {security.tabMonitoring ? `On (max ${security.maxTabSwitches})` : "Off"}
            </li>
            <li>Copy/paste: {security.blockCopyPaste ? "Blocked" : "Allowed"}</li>
          </ul>
          {TOTAL === 0 ? (
            <p className="mt-4 text-sm text-amber-700">
              No questions available. Contact your teacher.
            </p>
          ) : (
            <Button
              className="mt-6 w-full font-semibold"
              onClick={async () => {
                if (student) {
                  const { data: existing } = await supabase
                    .from("exam_attempts")
                    .select("id, status")
                    .eq("exam_id", exam.id)
                    .eq("student_id", student.studentId)
                    .maybeSingle();
                  if (
                    existing &&
                    ["submitted", "terminated", "flagged"].includes(String(existing.status))
                  ) {
                    toast.error("You have already completed this examination.");
                    setDoneTerminated(String(existing.status) === "terminated");
                    setDone(true);
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
              }}
            >
              Begin examination
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

  function selectOption(opt: number) {
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: opt }));
  }

  function toggleFlag() {
    if (!q) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
  }

  function submitExam() {
    if (
      confirm(
        `Submit examination? You have answered ${answeredCount} of ${TOTAL} questions.`,
      )
    ) {
      void finishAttempt(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="sm" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-bold">
                {exam.courses?.code ?? "EXAM"} — {exam.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
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
              onClick={submitExam}
            >
              Submit Exam
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1200px] flex-1 gap-4 p-3 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
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
          {security.tabMonitoring && (
            <p className="mt-2 text-[11px] text-slate-400">
              Tab switches: {tabSwitches}/{security.maxTabSwitches}
            </p>
          )}
        </aside>

        <section className="order-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-500">
              Question <span className="text-slate-900">{index + 1}</span> of {TOTAL}
            </p>
            <button
              type="button"
              onClick={toggleFlag}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                flagged.has(q.id)
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              <Flag className="h-3.5 w-3.5" />
              {flagged.has(q.id) ? "Marked for review" : "Mark for Review"}
            </button>
          </div>

          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">
            {q.question_text}
          </h1>

          <ul className="mt-6 space-y-3">
            {q.options.map((opt, oi) => {
              const selected = answers[q.id] === oi;
              return (
                <li key={`${q.id}-${oi}`}>
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
              className="rounded-lg font-semibold"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              className="rounded-lg font-semibold"
              disabled={index >= TOTAL - 1}
              onClick={() => setIndex((i) => Math.min(TOTAL - 1, i + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
