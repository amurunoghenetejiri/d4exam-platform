import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flag, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useStudentContext } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { saveCbtResult } from "@/lib/cbt-save-result";
import { friendlyError } from "@/lib/friendly-error";
import { parseQuestionOptions } from "@/lib/question-options";
import { toast } from "sonner";

type ExamDetail = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  course_id: string | null;
  school_id: string;
  courses: { code: string; name: string } | null;
};
type QRow = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  correct_answer: string | null;
  explanation: string | null;
  options?: unknown;
};

export function CbtExamPage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const examId = id ?? "";
  const { data: user } = useSessionUser();
  const { data: student } = useStudentContext();
  const { data: school } = useSchoolIdentity(user?.schoolId ?? student?.schoolId);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const started = useRef(false);

  const examQ = useQuery({
    queryKey: ["cbt-exam", examId],
    enabled: Boolean(examId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, status, duration_minutes, scheduled_start, scheduled_end, course_id, school_id, courses(code, name)",
        )
        .eq("id", examId)
        .maybeSingle();
      if (error) throw error;
      return data as ExamDetail | null;
    },
  });

  const qsQ = useQuery({
    queryKey: ["cbt-qs", examId, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const courseId = examQ.data!.course_id!;
      const schoolId = examQ.data!.school_id;
      // Question bank saves status as "active" (not "approved")
      let q = supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation, options")
        .eq("course_id", courseId)
        .in("status", ["active", "approved"])
        .order("created_at", { ascending: true })
        .limit(200);
      if (schoolId) q = q.eq("school_id", schoolId);
      const { data, error } = await q;
      if (error) {
        const fb = await supabase
          .from("questions")
          .select("id, question_text, question_type, marks, correct_answer, explanation")
          .eq("course_id", courseId)
          .in("status", ["active", "approved"])
          .limit(200);
        if (fb.error) throw error;
        return (fb.data ?? []) as QRow[];
      }
      return (data ?? []) as QRow[];
    },
  });

  const questions = useMemo(() => {
    return (qsQ.data ?? []).map((q) => {
      const parsed = parseQuestionOptions({
        options: q.options,
        explanation: q.explanation,
        correct_answer: q.correct_answer,
      });
      return {
        ...q,
        options: parsed.map((o) => o.text),
      };
    });
  }, [qsQ.data]);

  useEffect(() => {
    if (!examQ.data || started.current) return;
    started.current = true;
    const mins = examQ.data.duration_minutes || 30;
    setSecondsLeft(mins * 60);
    void (async () => {
      if (!student?.studentId || !examId) return;
      const { data } = await supabase
        .from("exam_attempts")
        .insert({
          exam_id: examId,
          student_id: student.studentId,
          school_id: examQ.data!.school_id,
          status: "in_progress",
          started_at: new Date().toISOString(),
        } as never)
        .select("id")
        .maybeSingle();
      if (data?.id) setAttemptId(data.id as string);
    })();
  }, [examQ.data, student?.studentId, examId]);

  useEffect(() => {
    if (secondsLeft == null || done) return;
    if (secondsLeft <= 0) {
      void finish(false);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, done]);

  const finish = useCallback(
    async (_manual: boolean) => {
      if (done || saving) return;
      setSaving(true);
      try {
        if (!examQ.data || !student?.studentId) throw new Error("Missing exam or student");
        const res = await saveCbtResult({
          examId: examQ.data.id,
          studentId: student.studentId,
          schoolId: examQ.data.school_id,
          attemptId,
          questions: questions.map((q) => ({
            id: q.id,
            marks: q.marks,
            correct_answer: q.correct_answer,
            options: q.options,
          })),
          answers,
        });
        if (res.error) toast.error(res.error.message);
        else toast.success("Exam submitted");
        if (res.resultId) setResultId(res.resultId);
        setDone(true);
      } catch (err) {
        toast.error(friendlyError(err, "Could not submit exam"));
      } finally {
        setSaving(false);
      }
    },
    [done, saving, examQ.data, student, attemptId, questions, answers],
  );

  const current = questions[idx];
  const total = questions.length;
  const mm = secondsLeft != null ? Math.floor(secondsLeft / 60) : 0;
  const ss = secondsLeft != null ? secondsLeft % 60 : 0;

  if (examQ.isLoading || qsQ.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading exam…
      </div>
    );
  }

  if (!examQ.data) {
    return <p className="p-6 text-sm">Exam not found.</p>;
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <SchoolLogo logoUrl={school?.logoUrl} schoolName={school?.name} size="lg" />
        <h1 className="text-xl font-bold">Exam submitted</h1>
        <p className="text-sm text-slate-600">
          Your answers have been saved. Results appear after the examination officer releases them.
        </p>
        {resultId ? (
          <Button asChild className="font-semibold">
            <Link to="/student/results/$id" params={{ id: resultId }}>
              View result
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/student/results">Go to my results</Link>
          </Button>
        )}
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-6 text-center">
        <SchoolLogo logoUrl={school?.logoUrl} schoolName={school?.name} size="lg" />
        <h1 className="text-lg font-bold">No questions available</h1>
        <p className="text-sm text-slate-600">
          This exam has no active questions yet. Contact your teacher or examination officer.
        </p>
        <Button asChild variant="outline">
          <Link to="/student/examinations">Back to exams</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
        <header className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-3 py-2 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <SchoolLogo
              logoUrl={school?.logoUrl}
              schoolName={school?.name ?? "School"}
              size="sm"
              className="ring-1 ring-white/20"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{examQ.data.title}</p>
              <p className="truncate text-xs text-white/70">{examQ.data.courses?.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-sm font-bold tabular-nums">
              {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </span>
            <Button
              size="sm"
              className="h-8 bg-white text-slate-900 hover:bg-white/90"
              disabled={saving}
              onClick={() => void finish(true)}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </div>
        </header>

        {current && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">
                Question {idx + 1} of {total}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setFlagged((f) => ({ ...f, [current.id]: !f[current.id] }))}
              >
                <Flag className="mr-1 h-3.5 w-3.5" />{" "}
                {flagged[current.id] ? "Flagged" : "Mark for Review"}
              </Button>
            </div>
            <p className="text-base font-semibold text-slate-900">{current.question_text}</p>
            <div className="mt-4 space-y-2">
              {(current.options.length ? current.options : ["True", "False"]).map((opt, i) => {
                const selected = answers[current.id] === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [current.id]: i }))}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                        selected
                          ? "border-primary bg-primary text-white"
                          : "border-slate-300",
                      )}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="pt-0.5">{opt}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={idx <= 0}
                onClick={() => setIdx((v) => Math.max(0, v - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button
                size="sm"
                className="font-semibold"
                disabled={idx >= total - 1}
                onClick={() => setIdx((v) => Math.min(total - 1, v + 1))}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Questions</p>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setIdx(i)}
                className={cn(
                  "h-9 w-9 rounded-lg text-xs font-bold",
                  i === idx
                    ? "bg-primary text-white"
                    : answers[q.id] != null
                      ? "bg-slate-200"
                      : "bg-slate-100",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Answered {Object.keys(answers).length} / {total}
          </p>
        </div>
      </div>
    </>
  );
}
