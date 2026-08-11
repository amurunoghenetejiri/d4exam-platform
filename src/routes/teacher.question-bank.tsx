import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Save, X } from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/dashboard/kit";
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
      { name: "description", content: "Create and edit examination questions and options." },
    ],
  }),
  component: Page,
});

function Page() {
  const [items, setItems] = useState<Question[]>(() => [...mock.questionBank]);
  const [editing, setEditing] = useState<Question | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter(
      (i) =>
        i.text.toLowerCase().includes(s) ||
        i.topic.toLowerCase().includes(s) ||
        i.type.toLowerCase().includes(s),
    );
  }, [items, q]);

  function startNew() {
    setEditing({
      id: `q-${Date.now()}`,
      text: "",
      options: ["", "", "", ""],
      answer: 0,
      type: "MCQ",
      marks: 2,
      topic: "General",
      difficulty: "Easy",
    });
  }

  function saveQuestion() {
    if (!editing) return;
    if (!editing.text.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (editing.options.some((o) => !o.trim())) {
      toast.error("Fill all options");
      return;
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
    toast.success("Question saved");
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
        description="Create, edit and manage exam questions and answer options."
        actions={
          <Button className="font-semibold" onClick={startNew}>
            <Plus className="mr-1.5 h-4 w-4" />
            New question
          </Button>
        }
      />

      <div className="mb-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search questions, topics…"
          className="max-w-md rounded-full border-slate-200 bg-white"
        />
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
                  <p className="text-sm font-bold text-slate-900">{item.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge status={item.type} />
                    <StatusBadge status={item.difficulty} />
                    <span className="text-xs text-slate-500">{item.topic} · {item.marks} marks</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ ...item, options: [...item.options] })} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-red-500" onClick={() => removeQuestion(item.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
              No questions match your search.
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
                <h2 className="text-base font-extrabold text-slate-900">Edit question</h2>
                <Button size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MCQ">MCQ</SelectItem>
                      <SelectItem value="True/False">True/False</SelectItem>
                      <SelectItem value="Theory">Theory</SelectItem>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
  );
}
