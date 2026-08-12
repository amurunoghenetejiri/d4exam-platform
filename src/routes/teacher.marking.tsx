import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import * as mock from "@/data/mock";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/marking")({
  head: () => ({
    meta: [
      { title: "Marking Center — D4EXAM" },
      { name: "description", content: "Mark subjective answers for your assigned course examinations." },
    ],
  }),
  component: Page,
});

function Page() {
  const pending = useMemo(
    () => mock.submissions.filter((s) => s.status === "awaiting marking" || s.theory === "Pending"),
    [],
  );
  const [selectedId, setSelectedId] = useState(pending[0]?.id ?? "");
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState<string[]>([]);

  const selected = pending.find((p) => p.id === selectedId && !done.includes(p.id));
  const queue = pending.filter((p) => !done.includes(p.id));

  function submitMark() {
    if (!selected) return;
    const n = Number(score);
    if (Number.isNaN(n) || n < 0 || n > 20) {
      toast.error("Enter a theory score between 0 and 20");
      return;
    }
    setDone((d) => [...d, selected.id]);
    setScore("");
    setFeedback("");
    toast.success(`Marked ${selected.student} — theory ${n}/20`);
    const next = queue.find((q) => q.id !== selected.id);
    setSelectedId(next?.id ?? "");
  }

  return (
    <>
      <PageHeader
        title="Marking Center"
        description="Score theory / essay answers. Objective items are auto-marked."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title={`Queue (${queue.length})`}>
          {queue.length === 0 ? (
            <EmptyState title="All caught up" description="No theory scripts waiting." />
          ) : (
            <ul className="space-y-2">
              {queue.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selectedId === s.id
                        ? "border-primary/40 bg-primary/5"
                        : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-900">{s.student}</p>
                    <p className="text-xs text-slate-500">
                      {s.matric} · {s.exam} · Obj {s.objective}
                    </p>
                    <StatusBadge status={s.status} className="mt-1" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Mark script">
          {!selected ? (
            <EmptyState title="Select a submission" description="Choose a student from the queue." />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-extrabold text-slate-900">{selected.student}</p>
                <p className="text-xs text-slate-500">
                  {selected.matric} · {selected.exam} · Submitted {selected.submitted}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Sample theory response</p>
                <p className="mt-2 leading-relaxed">
                  A variable is a named storage location in memory that holds a value which may change
                  during program execution. Unlike constants, variables can be reassigned…
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="font-semibold">Theory score (max 20)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="0–20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold">Objective (auto)</Label>
                  <Input value={String(selected.objective)} disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Feedback (optional)</Label>
                <Textarea
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Comments for the student…"
                />
              </div>

              <Button className="font-semibold" onClick={submitMark}>
                Save mark
              </Button>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
