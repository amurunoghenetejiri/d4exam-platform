import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckSquare,
  Copy,
  Download,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeacherContext } from "@/lib/teacher";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import {
  type DraftQuestion,
  downloadCsvTemplate,
  parseImportFile,
  validateAll,
} from "@/lib/question-import";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/question-bank")({
  head: () => ({
    meta: [
      { title: "Question Bank — D4EXAM" },
      {
        name: "description",
        content: "Create, import and manage examination questions for assigned courses.",
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
  explanation: string | null;
  correct_answer: string | null;
  courses: { code: string; name: string } | null;
  question_options?: { id: string; option_text: string; is_correct: boolean; option_order: number }[];
};

type EditorState = {
  id?: string;
  course_id: string;
  question_text: string;
  question_type: string;
  marks: number;
  difficulty: string;
  status: string;
  explanation: string;
  correct_answer: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

const STATUSES = ["draft", "ready_for_review", "approved", "rejected", "archived"] as const;

function Page() {
  const { data: teacher, isLoading: tLoading } = useTeacherContext();
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);

  // Import wizard
  const [importOpen, setImportOpen] = useState(false);
  const [importCourseId, setImportCourseId] = useState("");
  const [importDrafts, setImportDrafts] = useState<DraftQuestion[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "preview">("upload");

  const listQ = useQuery({
    queryKey: ["teacher-questions", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    queryFn: async () => {
      if (!teacher) return [] as QRow[];
      const { data, error } = await supabase
        .from("questions")
        .select(
          "id, question_text, question_type, marks, difficulty, course_id, status, explanation, correct_answer, courses(code, name), question_options(id, option_text, is_correct, option_order)",
        )
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as QRow[];
    },
  });

  const items = listQ.data ?? [];

  const filtered = useMemo(() => {
    let list = items;
    if (courseFilter !== "all") list = list.filter((i) => i.course_id === courseFilter);
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((i) => i.question_type === typeFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.question_text.toLowerCase().includes(s) ||
          (i.courses?.code ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [items, courseFilter, statusFilter, typeFilter, search]);

  function emptyEditor(courseId: string): EditorState {
    return {
      course_id: courseId,
      question_text: "",
      question_type: "mcq",
      marks: 1,
      difficulty: "easy",
      status: "draft",
      explanation: "",
      correct_answer: "A",
      option_a: "",
      option_b: "",
      option_c: "",
      option_d: "",
    };
  }

  function startNew() {
    if (!teacher?.courses.length) {
      toast.error("No courses assigned");
      return;
    }
    setEditing(emptyEditor(teacher.courses[0].id));
  }

  function loadIntoEditor(item: QRow) {
    const opts = [...(item.question_options ?? [])].sort(
      (a, b) => a.option_order - b.option_order,
    );
    const letter = ["A", "B", "C", "D"];
    let correct = item.correct_answer ?? "";
    opts.forEach((o, idx) => {
      if (o.is_correct) correct = letter[idx] ?? correct;
    });
    setEditing({
      id: item.id,
      course_id: item.course_id ?? teacher!.courses[0].id,
      question_text: item.question_text,
      question_type: item.question_type,
      marks: item.marks,
      difficulty: item.difficulty || "easy",
      status: item.status || "draft",
      explanation: item.explanation ?? "",
      correct_answer: correct || "A",
      option_a: opts[0]?.option_text ?? "",
      option_b: opts[1]?.option_text ?? "",
      option_c: opts[2]?.option_text ?? "",
      option_d: opts[3]?.option_text ?? "",
    });
  }

  async function saveOptions(questionId: string, ed: EditorState) {
    await supabase.from("question_options").delete().eq("question_id", questionId);
    const needs =
      ed.question_type === "mcq" ||
      ed.question_type === "true_false";
    if (!needs) return;
    const texts = [ed.option_a, ed.option_b, ed.option_c, ed.option_d];
    const correct = ed.correct_answer.trim().toUpperCase();
    const rows = texts
      .map((text, i) => ({
        question_id: questionId,
        option_text: text.trim() || (ed.question_type === "true_false" && i < 2 ? (i === 0 ? "True" : "False") : ""),
        is_correct: correct === String.fromCharCode(65 + i),
        option_order: i + 1,
      }))
      .filter((r) => r.option_text);
    if (rows.length) {
      const { error } = await supabase.from("question_options").insert(rows as never);
      if (error) throw error;
    }
  }

  async function saveQuestion() {
    if (!editing || !teacher || !session) return;
    if (!teacher.courseIds.includes(editing.course_id)) {
      toast.error("Select an assigned course");
      return;
    }
    if (!editing.question_text.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (
      (editing.question_type === "mcq" || editing.question_type === "true_false") &&
      (!editing.option_a.trim() || !editing.option_b.trim())
    ) {
      toast.error("Provide at least Option A and B");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        course_id: editing.course_id,
        question_text: editing.question_text.trim(),
        question_type: editing.question_type,
        marks: editing.marks,
        difficulty: editing.difficulty,
        status: editing.status,
        explanation: editing.explanation.trim() || null,
        correct_answer:
          editing.question_type === "mcq" || editing.question_type === "true_false"
            ? editing.correct_answer.trim().toUpperCase()
            : editing.correct_answer.trim() || null,
      };

      let qid = editing.id;
      if (editing.id) {
        const { error } = await supabase
          .from("questions")
          .update(payload as never)
          .eq("id", editing.id)
          .eq("school_id", teacher.schoolId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("questions")
          .insert({
            school_id: teacher.schoolId,
            created_by: session.userId,
            ...payload,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        qid = (data as { id: string }).id;
      }
      if (qid) await saveOptions(qid, editing);
      toast.success(editing.id ? "Question updated" : "Question saved to bank");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["teacher-questions"] });
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(id: string) {
    if (!teacher || !confirm("Delete this question permanently?")) return;
    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", id)
      .eq("school_id", teacher.schoolId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    if (editing?.id === id) setEditing(null);
    setSelectedIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    await listQ.refetch();
  }

  async function duplicateQuestion(item: QRow) {
    if (!teacher || !session) return;
    const { data, error } = await supabase
      .from("questions")
      .insert({
        school_id: teacher.schoolId,
        course_id: item.course_id,
        created_by: session.userId,
        question_text: item.question_text + " (copy)",
        question_type: item.question_type,
        marks: item.marks,
        difficulty: item.difficulty,
        status: "draft",
        explanation: item.explanation,
        correct_answer: item.correct_answer,
      } as never)
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const newId = (data as { id: string }).id;
    const opts = item.question_options ?? [];
    if (opts.length) {
      await supabase.from("question_options").insert(
        opts.map((o) => ({
          question_id: newId,
          option_text: o.option_text,
          is_correct: o.is_correct,
          option_order: o.option_order,
        })) as never,
      );
    }
    toast.success("Duplicated as draft");
    await listQ.refetch();
  }

  async function bulkStatus(status: string) {
    if (!teacher || selectedIds.size === 0) return;
    const { error } = await supabase
      .from("questions")
      .update({ status } as never)
      .in("id", [...selectedIds])
      .eq("school_id", teacher.schoolId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Updated ${selectedIds.size} question(s) to ${status.replaceAll("_", " ")}`);
      setSelectedIds(new Set());
      await listQ.refetch();
    }
  }

  async function bulkDelete() {
    if (!teacher || selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} question(s)?`)) return;
    const { error } = await supabase
      .from("questions")
      .delete()
      .in("id", [...selectedIds])
      .eq("school_id", teacher.schoolId);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      setSelectedIds(new Set());
      await listQ.refetch();
    }
  }

  async function onFilePicked(file: File | null) {
    if (!file || !teacher) return;
    setImportBusy(true);
    try {
      const drafts = await parseImportFile(file);
      if (!drafts.length) {
        toast.error("No questions extracted. Check file format.");
        return;
      }
      setImportDrafts(validateAll(drafts));
      setImportCourseId(teacher.courses[0]?.id ?? "");
      setImportStep("preview");
      setImportOpen(true);
      toast.message(`Extracted ${drafts.length} question(s) — review before import`);
    } catch (err) {
      toast.error((err as Error).message || "Import failed");
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!teacher || !session || !importCourseId) return;
    if (!teacher.courseIds.includes(importCourseId)) {
      toast.error("Select an assigned course");
      return;
    }
    const selected = validateAll(importDrafts).filter((d) => d.selected);
    const invalid = selected.filter((d) => d.errors.length > 0);
    if (invalid.length) {
      toast.error(`${invalid.length} selected question(s) still have errors. Fix them first.`);
      setImportDrafts(validateAll(importDrafts));
      return;
    }
    if (!selected.length) {
      toast.error("Select at least one valid question");
      return;
    }
    setImportBusy(true);
    try {
      let saved = 0;
      for (const d of selected) {
        const { data, error } = await supabase
          .from("questions")
          .insert({
            school_id: teacher.schoolId,
            course_id: importCourseId,
            created_by: session.userId,
            question_text: d.question_text.trim(),
            question_type: d.question_type,
            marks: d.marks,
            difficulty: "medium",
            status: "draft",
            explanation: d.explanation.trim() || null,
            correct_answer: d.correct_answer.trim() || null,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        const qid = (data as { id: string }).id;
        if (d.question_type === "mcq" || d.question_type === "true_false") {
          const texts = [d.option_a, d.option_b, d.option_c, d.option_d];
          const ca = d.correct_answer.trim().toUpperCase();
          const rows = texts
            .map((text, i) => ({
              question_id: qid,
              option_text: text.trim(),
              is_correct: ca === String.fromCharCode(65 + i),
              option_order: i + 1,
            }))
            .filter((r) => r.option_text);
          if (rows.length) {
            await supabase.from("question_options").insert(rows as never);
          }
        }
        saved++;
      }
      toast.success(`Imported ${saved} question(s) as draft. They are NOT auto-approved for exams.`);
      setImportOpen(false);
      setImportDrafts([]);
      setImportStep("upload");
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Import save failed");
    } finally {
      setImportBusy(false);
    }
  }

  if (tLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return <EmptyState title="Teacher profile not found" description="Contact School Admin." />;
  }

  const needsOpts =
    editing &&
    (editing.question_type === "mcq" || editing.question_type === "true_false");

  return (
    <>
      <PageHeader
        title="Question Bank"
        description={`${teacher.fullName} · Assigned courses only · Manual create or import (no AI)`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="font-semibold" onClick={downloadCsvTemplate}>
              <Download className="mr-1.5 h-4 w-4" />
              Template
            </Button>
            <Button
              variant="outline"
              className="font-semibold"
              disabled={!teacher.courses.length || importBusy}
              onClick={() => fileRef.current?.click()}
            >
              {importBusy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Import file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.docx,.pdf"
              className="hidden"
              onChange={(e) => void onFilePicked(e.target.files?.[0] ?? null)}
            />
            <Button className="font-semibold" onClick={startNew} disabled={!teacher.courses.length}>
              <Plus className="mr-1.5 h-4 w-4" />
              New question
            </Button>
          </div>
        }
      />

      {!teacher.courses.length ? (
        <EmptyState
          title="No courses assigned"
          description="School Admin must assign courses before you can manage the question bank."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              className="max-w-md rounded-full"
            />
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courses</SelectItem>
                {teacher.courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="mcq">MCQ</SelectItem>
                <SelectItem value="true_false">True/False</SelectItem>
                <SelectItem value="short_answer">Short Answer</SelectItem>
                <SelectItem value="essay">Essay</SelectItem>
                <SelectItem value="numerical">Numerical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedIds.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="font-semibold">{selectedIds.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => void bulkStatus("ready_for_review")}>
                Ready for review
              </Button>
              <Button size="sm" variant="outline" onClick={() => void bulkStatus("archived")}>
                <Archive className="mr-1 h-3.5 w-3.5" />
                Archive
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void bulkDelete()}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="space-y-3">
              {listQ.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
              {filtered.map((item) => {
                const checked = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-2xl border bg-white/90 p-4 shadow-sm",
                      checked ? "border-primary/40" : "border-slate-200",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelectedIds((prev) => {
                            const n = new Set(prev);
                            if (v === true) n.add(item.id);
                            else n.delete(item.id);
                            return n;
                          });
                        }}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-primary">
                          {item.courses?.code ?? "—"}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{item.question_text}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge status={item.question_type} />
                          <StatusBadge status={String(item.status).replaceAll("_", " ")} />
                          <span className="text-xs text-slate-500">{item.marks} marks</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <Button size="icon" variant="ghost" onClick={() => loadIntoEditor(item)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void duplicateQuestion(item)}
                          aria-label="Duplicate"
                        >
                          <Copy className="h-4 w-4" />
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
                );
              })}
              {!listQ.isLoading && filtered.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
                  No questions match. Create one or import a file.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm lg:sticky lg:top-24 lg:self-start">
              {!editing ? (
                <div className="space-y-4 py-8 text-center text-sm text-slate-500">
                  <p>Select <strong>Edit</strong> or create a new question.</p>
                  <p className="text-xs">
                    Supported import: .xlsx .xls .csv .docx .pdf · Always review answers before
                    confirm. Import does not approve exams.
                  </p>
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
                    <Label className="font-semibold">Course</Label>
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
                    <Label className="font-semibold">Question</Label>
                    <Textarea
                      rows={3}
                      value={editing.question_text}
                      onChange={(e) => setEditing({ ...editing, question_text: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
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
                          <SelectItem value="numerical">Numerical</SelectItem>
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
                      <Label className="font-semibold">Status</Label>
                      <Select
                        value={editing.status}
                        onValueChange={(v) => setEditing({ ...editing, status: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.replaceAll("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {needsOpts && (
                    <div className="space-y-2">
                      <Label className="font-semibold">Options & correct answer</Label>
                      {(["a", "b", "c", "d"] as const).map((key, i) => {
                        const letter = String.fromCharCode(65 + i);
                        const field = `option_${key}` as const;
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="correct"
                              checked={editing.correct_answer.toUpperCase() === letter}
                              onChange={() =>
                                setEditing({ ...editing, correct_answer: letter })
                              }
                              className="h-4 w-4 accent-primary"
                              aria-label={`Mark ${letter} correct`}
                            />
                            <span className="w-5 text-xs font-bold">{letter}.</span>
                            <Input
                              value={editing[field]}
                              onChange={(e) =>
                                setEditing({ ...editing, [field]: e.target.value })
                              }
                              placeholder={`Option ${letter}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!needsOpts && (
                    <div className="space-y-2">
                      <Label className="font-semibold">
                        Correct answer{" "}
                        {editing.question_type === "essay" ? "(optional key)" : ""}
                      </Label>
                      <Input
                        value={editing.correct_answer}
                        onChange={(e) =>
                          setEditing({ ...editing, correct_answer: e.target.value })
                        }
                        placeholder="Expected answer"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="font-semibold">Explanation (optional)</Label>
                    <Textarea
                      rows={2}
                      value={editing.explanation}
                      onChange={(e) => setEditing({ ...editing, explanation: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button className="font-semibold" disabled={busy} onClick={() => void saveQuestion()}>
                      {busy ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-4 w-4" />
                      )}
                      Save to bank
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Import preview modal-like panel */}
          {importOpen && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
              <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div>
                    <h2 className="text-base font-extrabold">Import preview</h2>
                    <p className="text-xs text-slate-500">
                      Edit every question. Invalid rows will not save. No AI — you control answers.
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setImportOpen(false);
                      setImportStep("upload");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3 overflow-y-auto px-4 py-3">
                  <div className="space-y-1.5">
                    <Label className="font-semibold">Save under course</Label>
                    <Select value={importCourseId} onValueChange={setImportCourseId}>
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

                  {importDrafts.map((d, idx) => (
                    <div
                      key={d.localId}
                      className={cn(
                        "rounded-xl border p-3",
                        d.errors.length ? "border-red-200 bg-red-50/40" : "border-slate-200",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold">
                          <Checkbox
                            checked={d.selected}
                            onCheckedChange={(v) => {
                              setImportDrafts((rows) =>
                                rows.map((r, i) =>
                                  i === idx ? { ...r, selected: v === true } : r,
                                ),
                              );
                            }}
                          />
                          Question {idx + 1}
                        </label>
                        {d.errors.length > 0 && (
                          <span className="text-[11px] font-semibold text-red-600">
                            {d.errors.join(" · ")}
                          </span>
                        )}
                      </div>
                      <Textarea
                        rows={2}
                        className="mb-2"
                        value={d.question_text}
                        onChange={(e) => {
                          setImportDrafts((rows) =>
                            validateAll(
                              rows.map((r, i) =>
                                i === idx ? { ...r, question_text: e.target.value } : r,
                              ),
                            ),
                          );
                        }}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(["a", "b", "c", "d"] as const).map((k) => (
                          <Input
                            key={k}
                            placeholder={`Option ${k.toUpperCase()}`}
                            value={d[`option_${k}`]}
                            onChange={(e) => {
                              setImportDrafts((rows) =>
                                validateAll(
                                  rows.map((r, i) =>
                                    i === idx ? { ...r, [`option_${k}`]: e.target.value } : r,
                                  ),
                                ),
                              );
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <Input
                          placeholder="Correct (A–D or text)"
                          value={d.correct_answer}
                          onChange={(e) => {
                            setImportDrafts((rows) =>
                              validateAll(
                                rows.map((r, i) =>
                                  i === idx ? { ...r, correct_answer: e.target.value } : r,
                                ),
                              ),
                            );
                          }}
                        />
                        <Select
                          value={d.question_type}
                          onValueChange={(v) => {
                            setImportDrafts((rows) =>
                              validateAll(
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, question_type: v as DraftQuestion["question_type"] }
                                    : r,
                                ),
                              ),
                            );
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mcq">MCQ</SelectItem>
                            <SelectItem value="true_false">True/False</SelectItem>
                            <SelectItem value="short_answer">Short Answer</SelectItem>
                            <SelectItem value="essay">Essay</SelectItem>
                            <SelectItem value="numerical">Numerical</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          value={d.marks}
                          onChange={(e) => {
                            setImportDrafts((rows) =>
                              validateAll(
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, marks: Number(e.target.value) || 1 }
                                    : r,
                                ),
                              ),
                            );
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setImportOpen(false);
                      setImportDrafts([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button className="font-semibold" disabled={importBusy} onClick={() => void confirmImport()}>
                    {importBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Confirm import
                  </Button>
                </div>
              </div>
            </div>
          )}

          <SectionCard className="mt-6" title="How this fits exam creation">
            <p className="text-sm text-slate-600">
              Question Bank → select questions when creating an examination → submit for officer
              approval → officer approves → exam is scheduled → eligible students sit the exam.
              Importing or creating questions never auto-approves an examination.
            </p>
          </SectionCard>
        </>
      )}
    </>
  );
}
