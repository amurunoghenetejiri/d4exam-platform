import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";

export const Route = createFileRoute("/officer/exam-preview/$id")({
  head: () => ({ meta: [{ title: "Exam Preview — D4EXAM" }] }),
  component: Page,
});

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

function Page() {
  const { id } = Route.useParams();
  const { data: user } = useSessionUser();
  const { data: school } = useSchoolIdentity(user?.schoolId);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});

  const examQ = useQuery({
    queryKey: ["officer-exam-preview", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, course_id, duration_minutes, school_id, courses(code, name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const qsQ = useQuery({
    queryKey: ["officer-exam-preview-qs", id, examQ.data?.course_id],
    enabled: Boolean(examQ.data?.course_id),
    queryFn: async () => {
      const courseId = examQ.data?.course_id;
      if (!courseId) return [] as QRow[];
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation")
        .eq("course_id", courseId)
        .eq("status", "approved")
        .limit(50);
      if (error) throw error;
      return (data ?? []) as QRow[];
    },
  });

  const questions = useMemo(() => {
    return (qsQ.data ?? []).map((q) => ({
      ...q,
      options: decodeOptions(q.explanation),
    }));
  }, [qsQ.data]);

  const current = questions[idx];
  const total = questions.length;

  if (examQ.isLoading || qsQ.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
      </div>
    );
  }

  if (!examQ.data) {
    return <p className="p-6 text-sm text-slate-500">Exam not found.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-6">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <SchoolLogo logoUrl={school?.logoUrl} schoolName={school?.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{examQ.data.title}</p>
            <p className="text-xs text-slate-500">Officer preview · answers selectable</p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 shrink-0 text-xs">
          <Link to="/officer/results"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back</Link>
        </Button>
      </div>

      {total === 0 ? (
        <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">No approved questions for this course yet.</p>
      ) : current ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-primary">Question {idx + 1} of {total}</p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => setFlagged((f) => ({ ...f, [current.id]: !f[current.id] }))}
            >
              <Flag className="mr-1 h-3.5 w-3.5" /> {flagged[current.id] ? "Flagged" : "Mark for review"}
            </Button>
          </div>
          <p className="text-base font-semibold text-slate-900">{current.question_text}</p>
          <div className="mt-4 space-y-2">
            {current.options.map((opt, i) => {
              const selected = answers[current.id] === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAnswers((a) => ({ ...a, [current.id]: i }))}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition",
                    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold", selected ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-600")}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="pt-0.5">{opt}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" className="h-9" disabled={idx <= 0} onClick={() => setIdx((v) => Math.max(0, v - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button size="sm" className="h-9 font-semibold" disabled={idx >= total - 1} onClick={() => setIdx((v) => Math.min(total - 1, v + 1))}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {total > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Questions</p>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setIdx(i)}
                className={cn(
                  "h-9 w-9 rounded-lg text-xs font-bold",
                  i === idx ? "bg-primary text-white" : answers[q.id] != null ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-600",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Answered {Object.keys(answers).length} / {total}</p>
        </div>
      )}
    </div>
  );
}
