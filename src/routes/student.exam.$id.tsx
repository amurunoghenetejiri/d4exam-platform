import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Flag, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/exam/$id")({
  head: () => ({
    meta: [
      { title: "CBT Examination — D4EXAM" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CbtExamPage,
});

const TOTAL = 50;

const SAMPLE_QUESTIONS = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  text:
    i === 17
      ? "What is a variable in programming?"
      : `Sample question ${i + 1}: Select the most appropriate answer for this examination item.`,
  options:
    i === 17
      ? [
          "A fixed value",
          "A storage location",
          "An operating system",
          "A network",
        ]
      : [
          "Option A — first choice",
          "Option B — second choice",
          "Option C — third choice",
          "Option D — fourth choice",
        ],
}));

function CbtExamPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [index, setIndex] = useState(17);
  const [answers, setAnswers] = useState<Record<number, number>>({ 18: 1 });
  const [flagged, setFlagged] = useState<Set<number>>(new Set([5, 12]));
  const [seconds, setSeconds] = useState(47 * 60 + 32);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const q = SAMPLE_QUESTIONS[index];
  const answeredCount = Object.keys(answers).length;

  const statusFor = (n: number) => {
    if (flagged.has(n)) return "flagged";
    if (answers[n] != null) return "answered";
    if (n === index + 1) return "current";
    return "blank";
  };

  const legend = useMemo(
    () => [
      { label: "Answered", className: "bg-emerald-500" },
      { label: "Not Answered", className: "bg-slate-300" },
      { label: "Marked", className: "bg-amber-400" },
      { label: "Not Visited", className: "border border-slate-300 bg-white" },
    ],
    [],
  );

  function selectOption(opt: number) {
    setAnswers((prev) => ({ ...prev, [index + 1]: opt }));
  }

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev);
      const n = index + 1;
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  function submitExam() {
    if (confirm(`Submit examination? You have answered ${answeredCount} of ${TOTAL} questions.`)) {
      navigate({ to: "/student/results" });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      {/* Exam header — no dashboard chrome */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#0b1b3a] text-white">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="sm" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-bold">{id.toUpperCase()} — First Semester Examination</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-sm font-bold",
                seconds < 300 ? "bg-red-500 text-white" : "bg-white/10 text-white",
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
        {/* Question navigator */}
        <aside className="order-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:order-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Questions</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {Array.from({ length: TOTAL }, (_, i) => {
              const n = i + 1;
              const st = statusFor(n);
              return (
                <button
                  key={n}
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
                  {n}
                </button>
              );
            })}
          </div>
          <ul className="mt-4 space-y-2 text-xs text-slate-600">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-2">
                <span className={cn("h-3 w-3 rounded-sm", l.className)} />
                {l.label}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Answered <span className="font-bold text-slate-800">{answeredCount}</span> / {TOTAL}
          </p>
        </aside>

        {/* Question panel */}
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
                flagged.has(index + 1)
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              <Flag className="h-3.5 w-3.5" />
              {flagged.has(index + 1) ? "Marked for review" : "Mark for Review"}
            </button>
          </div>

          <h1 className="mt-4 text-lg font-bold leading-snug text-slate-900 sm:text-xl">{q.text}</h1>

          <ul className="mt-6 space-y-3">
            {q.options.map((opt, oi) => {
              const selected = answers[index + 1] === oi;
              return (
                <li key={opt}>
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

          <p className="mt-4 text-center text-xs text-slate-400">
            <Link to="/student/examinations" className="hover:text-primary">
              Exit to examinations list
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
