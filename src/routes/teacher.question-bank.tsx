import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Save, X, Loader2 } from "lucide-react";
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
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/question-bank")({
  head: () => ({
    meta: [
      { title: "Question Bank — D4EXAM" },
      {
        name: "description",
        content: "Create and edit examination questions for your assigned courses.",
      },
    ],
  }),
  component: Page,
});

type QRow = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  difficulty: string;
  course_id: string | null;
  status: string;
  courses: { code: string; name: string } | null;
};

type Draft = {
  id?: string;
  course_id: string;
  question_text: string;
  question_type: string;
  marks: number;
  difficulty: string;
};

function Page() {
  const { data: teacher, isLoading: tLoading } = useTeacherContext();
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const listQ = useQuery({
    queryKey: ["teacher-questions", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    queryFn: async () => {
      if (!teacher) return [] as QRow[];
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, difficulty, course_id, status, courses(code, name)")
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as QRow[];
    },
  });

  const items = listQ.data ?? [];

  const filtered = useMemo(() => {
    let list = items;
    if (courseFilter !== "all") list = list.filter((i) => i.course_id === courseFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.question_text.toLowerCase().includes(s) ||
          i.question_type.toLowerCase().includes(s) ||
          (i.courses?.code ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [items, courseFilter, search]);

  function startNew() {
    if (!teacher?.courses.length) {
      toast.error("No courses assigned. Ask School Admin first.");
      return;
    }
    setEditing({
      course_id: teacher.courses[0].id,
      question_text: "",
      question_type: "mcq",
      marks: 1,
      difficulty: "easy",
    });
  }

  async function saveQuestion() {
    if (!editing || !teacher || !session) return;
    if (!teacher.courseIds.includes(editing.course_id)) {
      toast.error("Select one of your assigned courses");
      return;
    }
    if (!editing.question_text.trim()) {
      toast.error("Question text is required");
      return;
    }
    setBusy(true);
    try {
      if (editing.id) {
        const { error } = await supabase
          .from("questions")
          .update({
            course_id: editing.course_id,
            question_text: editing.question_text.trim(),
            question_type: editing.question_type,
            marks: editing.marks,
            difficulty: editing.difficulty,
          } as never)
          .eq("id", editing.id)
          .eq("school_id", teacher.schoolId);
        if (error) throw error;
        toast.success("Question updated");
      } else {
        const { error } = await supabase.from("questions").insert({
          school_id: teacher.schoolId,
          course_id: editing.course_id,
          created_by: session.userId,
          question_text: editing.question_text.trim(),
          question_type: editing.question_type,
          marks: editing.marks,
          difficulty: editing.difficulty,
          status: "active",
        } as never);
        if (error) throw error;
        toast.success("Question created");
      }
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["teacher-questions"] });
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not save question");
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(id: string) {
    if (!teacher || !confirm("Delete this question?")) return;
    try {
      const { error } = await supabase
        .from("questions")
        .delete()
        .eq("id", id)
        .eq("school_id", teacher.schoolId);
      if (error) throw error;
      toast.success("Question deleted");
      if (editing?.id === id) setEditing(null);
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not delete");
    }
  }

  if (tLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return (
      <EmptyState
        title="Teacher profile not found"
        description="Contact School Admin."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Question Bank"
        description={`Live questions for your assigned courses · ${teacher.fullName}`}
        actions={
          <Button
            className="font-semibold"
            onClick={startNew}
            disabled={!teacher.courses.length}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New question
          </Button>
        }
      />

      {teacher.courses.length === 0 ? (
        <EmptyState
          title="No courses assigned"
          description="School Admin must assign courses before you can add questions."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              className="max-w-md rounded-full border-slate-200 bg-white"
            />
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assigned</SelectItem>
                {teacher.courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              {listQ.isLoading && <p className="text-sm text-slate-500">Loading questions…</p>}
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary">
                        {item.courses?.code ?? "—"}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{item.question_text}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge status={item.question_type} />
                        <StatusBadge status={item.difficulty} />
                        <span className="text-xs text-slate-500">{item.marks} marks</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setEditing({
                            id: item.id,
                            course_id: item.course_id ?? teacher.courses[0].id,
                            question_text: item.question_text,
                            question_type: item.question_type,
                            marks: item.marks,
                            difficulty: item.difficulty,
                          })
                        }
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => void removeQuestion(item.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {!listQ.isLoading && filtered.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
                  No questions yet. Create one for an assigned course.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm lg:sticky lg:top-24 lg:self-start">
              {!editing ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  Select <strong>Edit</strong> or create a new question.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-slate-900">
                      {editing.id ? "Edit question" : "New question"}
                    </h2>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold">Assigned course</Label>
                    <Select
                      value={editing.course_id}
                      onValueChange={(v) => setEditing({ ...editing, course_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {teacher.courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold">Question text</Label>
                    <Textarea
                      value={editing.question_text}
                      onChange={(e) => setEditing({ ...editing, question_text: e.target.value })}
                      rows={4}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="font-semibold">Type</Label>
                      <Select
                        value={editing.question_type}
                        onValueChange={(v) => setEditing({ ...editing, question_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mcq">MCQ</SelectItem>
                          <SelectItem value="true_false">True/False</SelectItem>
                          <SelectItem value="short_answer">Short Answer</SelectItem>
                          <SelectItem value="essay">Essay</SelectItem>
                          <SelectItem value="theory">Theory</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">Difficulty</Label>
                      <Select
                        value={editing.difficulty}
                        onValueChange={(v) => setEditing({ ...editing, difficulty: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">Marks</Label>
                      <Input
                        type="number"
                        min={1}
                        value={editing.marks}
                        onChange={(e) =>
                          setEditing({ ...editing, marks: Number(e.target.value) || 1 })
                        }
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button className="font-semibold" onClick={() => void saveQuestion()} disabled={busy}>
                      {busy ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-4 w-4" />
                      )}
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
