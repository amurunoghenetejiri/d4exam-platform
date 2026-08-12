import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Save, X } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as mock from "@/data/mock";
import type { Question } from "@/types";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/question-bank")({
  head: () => ({
    meta: [
      { title: "Question Bank — D4EXAM" },
      { name: "description", content: "Create and edit examination questions for your assigned courses." },
    ],
  }),
  component: Page,
});

const ASSIGNED = mock.currentTeacher.assignedCourses;

function Page() {
  const [items, setItems] = useState<Question[]>(() =>
    mock.questionBank.filter((q) => ASSIGNED.includes(q.courseCode ?? "")),
  );
  const [editing, setEditing] = useState<Question | null>(null);
  const [q, setQ] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = items;
    if (courseFilter !== "all") {
      list = list.filter((i) => i.courseCode === courseFilter);
    }
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter(
      (i) =>
        i.text.toLowerCase().includes(s) ||
        i.topic.toLowerCase().includes(s) ||
        i.type.toLowerCase().includes(s) ||
        (i.courseCode ?? "").toLowerCase().includes(s),
    );
  }, [items, q, courseFilter]);

  function startNew() {
    if (ASSIGNED.length === 0) {
      toast.error("No courses assigned. Ask School Admin to assign courses first.");
      return;
    }
    setEditing({
      id: `q-${Date.now()}`,
      text: "",
      options: ["", "", "", ""],
      answer: 0,
      type: "MCQ",
      marks: 2,
      topic: "General",
      difficulty: "Easy",
      courseCode: ASSIGNED[0],
      status: "active",
    });
  }

  function saveQuestion() {
    if (!editing) return;
    if (!editing.courseCode || !ASSIGNED.includes(editing.courseCode)) {
      toast.error("Select one of your assigned courses");
      return;
    }
    if (!editing.text.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (editing.type !== "Theory" && editing.type !== "Essay" && editing.type !== "Short Answer") {
      if (editing.options.some((o) => !o.trim())) {
        toast.error("Fill all options");
        return;
      }
    }
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === editing.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = editing;
        return next;
      }
      return [editing, ...prev];
    });
    toast.success("Question saved to your bank");
    setEditing(null);
  }

  function removeQuestion(id: string) {
    if (!confirm("Delete this question?")) return;
    setItems((prev) => prev.filter((p) => p.id !== id));
    if (editing?.id === id) setEditing(null);
    toast.success("Question deleted");
  }

  return (
    <>
      <PageHeader
        title="Question Bank"
        description="Create questions only for courses assigned to you by School Admin. Use them when building examinations."
        actions={
          <Button className="font-semibold" onClick={startNew} disabled={ASSIGNED.length === 0}>
            <Plus className="mr-1.5 h-4 w-4" />
            New question
          </Button>
        }
      />

      {ASSIGNED.length === 0 ? (
        <EmptyState
          title="No courses assigned"
          description="School Admin must assign courses before you can add questions."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search questions, topics…"
              className="max-w-md rounded-full border-slate-200 bg-white"
            />
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assigned</SelectItem>
                {ASSIGNED.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary">
                        {item.courseCode}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{item.text}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge status={item.type} />
                        <StatusBadge status={item.difficulty} />
                        <span className="text-xs text-slate-500">
                          {item.topic} · {item.marks} marks
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing({ ...item, options: [...item.options] })}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => removeQuestion(item.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
                  No questions yet. Create one for an assigned course.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:self-start">
              {!editing ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  Select <strong>Edit</strong> on a question or create a new one.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-slate-900">
                      {items.some((i) => i.id === editing.id) ? "Edit question" : "New question"}
                    </h2>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="Close">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold">Assigned course</Label>
                    <Select
                      value={editing.courseCode}
                      onValueChange={(v) => setEditing({ ...editing, courseCode: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNED.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold">Question text</Label>
                    <Textarea
                      value={editing.text}
                      onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                      rows={3}
                      className="border-slate-200"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="font-semibold">Type</Label>
                      <Select
                        value={editing.type}
                        onValueChange={(v) => setEditing({ ...editing, type: v as Question["type"] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MCQ">MCQ</SelectItem>
                          <SelectItem value="True/False">True/False</SelectItem>
                          <SelectItem value="Theory">Theory</SelectItem>
                          <SelectItem value="Short Answer">Short Answer</SelectItem>
                          <SelectItem value="Essay">Essay</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">Difficulty</Label>
                      <Select
                        value={editing.difficulty}
                        onValueChange={(v) =>
                          setEditing({ ...editing, difficulty: v as Question["difficulty"] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Easy">Easy</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">Marks</Label>
                      <Input
                        type="number"
                        min={1}
                        value={editing.marks}
                        onChange={(e) => setEditing({ ...editing, marks: Number(e.target.value) || 1 })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold">Topic</Label>
                    <Input
                      value={editing.topic}
                      onChange={(e) => setEditing({ ...editing, topic: e.target.value })}
                    />
                  </div>

                  {editing.type !== "Theory" &&
                    editing.type !== "Essay" &&
                    editing.type !== "Short Answer" && (
                      <div className="space-y-3">
                        <Label className="font-semibold">Options (select correct answer)</Label>
                        {editing.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="correct"
                              checked={editing.answer === i}
                              onChange={() => setEditing({ ...editing, answer: i })}
                              className="h-4 w-4 accent-primary"
                              aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`}
                            />
                            <span className="w-5 text-xs font-bold text-slate-500">
                              {String.fromCharCode(65 + i)}.
                            </span>
                            <Input
                              value={opt}
                              onChange={(e) => {
                                const options = [...editing.options];
                                options[i] = e.target.value;
                                setEditing({ ...editing, options });
                              }}
                              placeholder={`Option ${String.fromCharCode(65 + i)}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                  <div className="flex gap-2 pt-2">
                    <Button className="font-semibold" onClick={saveQuestion}>
                      <Save className="mr-1.5 h-4 w-4" />
                      Save question
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
