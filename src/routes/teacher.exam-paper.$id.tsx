import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Eye,
  FileDown,
  Loader2,
  Save,
  Search,
} from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseQuestionOptions } from "@/lib/question-options";

export const Route = createFileRoute("/teacher/exam-paper/$id")({
  head: () => ({
    meta: [{ title: "Exam paper builder - D4EXAM" }],
  }),
  component: Page,
});

type Exam = {
  id: string;
  title: string;
  course_id: string | null;
  school_id: string;
  status: string;
  questions_to_answer: number | null;
  total_marks: number | null;
  courses: { code: string; name: string } | null;
};

type Q = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  correct_answer: string | null;
  explanation: string | null;
  options: unknown;
};

type PaperItem = {
  question_id: string;
  question_order: number;
  marks: number;
  section: string;
};

/** Escape for HTML export. Built without entity literals so tooling cannot strip them. */
function escapeHtml(s: string) {
  const amp = String.fromCharCode(38); // &
  return s
    .split(amp)
    .join(amp + "amp;")
    .split("<")
    .join(amp + "lt;")
    .split(">")
    .join(amp + "gt;")
    .split('"')
    .join(amp + "quot;");
}

function Page() {
  const { id } = Route.useParams();
  const { data: teacher } = useTeacherContext();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paper, setPaper] = useState<PaperItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [questionsToAnswer, setQuestionsToAnswer] = useState<number>(0);
  const [preview, setPreview] = useState(false);
  const [includeKey, setIncludeKey] = useState(false);

  const examQ = useQuery({
    queryKey: ["teacher-exam-paper", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, course_id, school_id, status, questions_to_answer, total_marks, courses(code, name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("examinations")
          .select("id, title, course_id, school_id, status, courses(code, name)")
          .eq("id", id)
          .maybeSingle();
        if (e2) throw e2;
        return {
          ...(d2 as Exam),
          questions_to_answer: null,
          total_marks: null,
        };
      }
      return data as Exam | null;
    },
  });

  const bankQ = useQuery({
    queryKey: ["paper-bank", examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.course_id && examQ.data?.school_id),
    queryFn: async () => {
      const exam = examQ.data!;
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation, options")
        .eq("school_id", exam.school_id)
        .eq("course_id", exam.course_id!)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("questions")
          .select("id, question_text, question_type, marks, correct_answer, explanation")
          .eq("school_id", exam.school_id)
          .eq("course_id", exam.course_id!)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(500);
        if (e2) throw e2;
        return ((d2 ?? []) as Q[]).map((q) => ({ ...q, options: [] }));
      }
      return (data ?? []) as unknown as Q[];
    },
  });

  const linksQ = useQuery({
    queryKey: ["paper-links", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select("question_id, question_order, marks")
        .eq("exam_id", id)
        .order("question_order");
      if (error) throw error;
      return (data ?? []) as { question_id: string; question_order: number; marks: number }[];
    },
  });

  useEffect(() => {
    if (linksQ.data && bankQ.data && !loaded) {
      const items: PaperItem[] = linksQ.data.map((l) => {
        const q = bankQ.data!.find((b) => b.id === l.question_id);
        return {
          question_id: l.question_id,
          question_order: l.question_order,
          marks: l.marks ?? q?.marks ?? 1,
          section: "Main",
        };
      });
      setPaper(items);
      setQuestionsToAnswer(
        examQ.data?.questions_to_answer && examQ.data.questions_to_answer > 0
          ? examQ.data.questions_to_answer
          : items.length,
      );
      setLoaded(true);
    }
  }, [linksQ.data, bankQ.data, loaded, examQ.data?.questions_to_answer]);

  const bank = bankQ.data ?? [];
  const selectedIds = useMemo(() => new Set(paper.map((p) => p.question_id)), [paper]);

  const filteredBank = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bank.filter((row) => {
      if (typeFilter !== "all" && row.question_type !== typeFilter) return false;
      if (!q) return true;
      return row.question_text.toLowerCase().includes(q);
    });
  }, [bank, search, typeFilter]);

  const totalMarks = useMemo(
    () => paper.reduce((s, p) => s + (Number(p.marks) || 0), 0),
    [paper],
  );

  function toggle(qid: string) {
    setPaper((prev) => {
      if (prev.some((p) => p.question_id === qid)) {
        return prev
          .filter((p) => p.question_id !== qid)
          .map((p, i) => ({ ...p, question_order: i + 1 }));
      }
      const q = bank.find((b) => b.id === qid);
      return [
        ...prev,
        {
          question_id: qid,
          question_order: prev.length + 1,
          marks: q?.marks ?? 1,
          section: "Main",
        },
      ];
    });
  }

  function selectAllFiltered() {
    setPaper((prev) => {
      const map = new Map(prev.map((p) => [p.question_id, p]));
      for (const q of filteredBank) {
        if (!map.has(q.id)) {
          map.set(q.id, {
            question_id: q.id,
            question_order: map.size + 1,
            marks: q.marks ?? 1,
            section: "Main",
          });
        }
      }
      return [...map.values()].map((p, i) => ({ ...p, question_order: i + 1 }));
    });
  }

  function clearAll() {
    setPaper([]);
  }

  function move(idx: number, dir: -1 | 1) {
    setPaper((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((p, i) => ({ ...p, question_order: i + 1 }));
    });
  }

  function setMarks(qid: string, marks: number) {
    setPaper((prev) =>
      prev.map((p) => (p.question_id === qid ? { ...p, marks: Math.max(0.5, marks) } : p)),
    );
  }

  async function save() {
    if (!teacher || !examQ.data) return;
    if (["ongoing", "completed", "closed"].includes(examQ.data.status)) {
      toast.error("Cannot change paper for a live/completed exam");
      return;
    }
    if (paper.length === 0) {
      toast.error("Add at least one question before saving");
      return;
    }
    const required = questionsToAnswer > 0 ? questionsToAnswer : paper.length;
    if (paper.length < required) {
      toast.error(`Paper needs at least ${required} question(s) (currently ${paper.length})`);
      return;
    }

    setBusy(true);
    try {
      await supabase.from("exam_questions").delete().eq("exam_id", id);
      const rows = paper.map((p, i) => ({
        exam_id: id,
        question_id: p.question_id,
        question_order: i + 1,
        marks: p.marks,
      }));
      const { error } = await supabase.from("exam_questions").insert(rows as never);
      if (error) throw error;

      await supabase
        .from("examinations")
        .update({
          questions_to_answer: required,
          total_marks: totalMarks,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id);

      toast.success(`Paper saved: ${rows.length} question(s), ${totalMarks} total marks`);
      await linksQ.refetch();
      await qc.invalidateQueries({ queryKey: ["cbt-questions"] });
      await qc.invalidateQueries({ queryKey: ["teacher-exams"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not save paper");
    } finally {
      setBusy(false);
    }
  }

  function exportPrintable() {
    if (!paper.length) {
      toast.error("No questions on paper");
      return;
    }
    const exam = examQ.data!;
    const lines: string[] = [];
    lines.push("<html><head><title>" + escapeHtml(exam.title) + "</title>");
    lines.push(
      "<style>" +
        "body{font-family:system-ui,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#0f172a}" +
        "h1{font-size:20px;margin:0 0 4px}.meta{color:#64748b;font-size:13px;margin-bottom:20px}" +
        ".q{border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:12px}" +
        ".q h3{margin:0 0 8px;font-size:14px}.opts{margin:0;padding-left:18px;font-size:13px}" +
        ".key{color:#059669;font-size:12px;margin-top:6px}@media print{.no-print{display:none}}" +
        "</style></head><body>",
    );
    lines.push("<h1>" + escapeHtml(exam.title) + "</h1>");
    lines.push(
      '<p class="meta">' +
        escapeHtml(exam.courses?.code || "") +
        " - " +
        escapeHtml(exam.courses?.name || "") +
        " · " +
        String(paper.length) +
        " questions · " +
        String(totalMarks) +
        " marks</p>",
    );
    paper.forEach((p, i) => {
      const q = bank.find((b) => b.id === p.question_id);
      if (!q) return;
      const opts = parseQuestionOptions(q);
      lines.push(
        '<div class="q"><h3>Q' +
          String(i + 1) +
          ". " +
          escapeHtml(q.question_text) +
          ' <span style="color:#64748b;font-weight:500">(' +
          String(p.marks) +
          " mk)</span></h3>",
      );
      if (opts.length) {
        lines.push('<ol class="opts" type="A">');
        for (const o of opts) lines.push("<li>" + escapeHtml(o.text) + "</li>");
        lines.push("</ol>");
      }
      if (includeKey && q.correct_answer) {
        lines.push('<p class="key">Answer: ' + escapeHtml(q.correct_answer) + "</p>");
      }
      lines.push("</div>");
    });
    lines.push(
      '<p class="no-print"><button onclick="window.print()">Print / Save PDF</button></p>',
    );
    lines.push("</body></html>");
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Allow pop-ups to export");
      return;
    }
    w.document.write(lines.join(""));
    w.document.close();
  }

  const exam = examQ.data;

  if (examQ.isLoading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!exam) {
    return <EmptyState title="Exam not found" description="It may have been deleted." />;
  }

  if (preview) {
    return (
      <>
        <PageHeader
          title="Preview as student"
          description={exam.title + " - read-only student view"}
          actions={
            <Button variant="outline" onClick={() => setPreview(false)}>
              Exit preview
            </Button>
          }
        />
        <SectionCard title={"Paper (" + paper.length + " questions · " + totalMarks + " marks)"}>
          <ol className="space-y-4">
            {paper.map((p, i) => {
              const q = bank.find((b) => b.id === p.question_id);
              if (!q) return null;
              const opts = parseQuestionOptions(q);
              return (
                <li key={p.question_id} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Q{i + 1} · {q.question_type.replaceAll("_", " ")} · {p.marks} mark(s)
                  </p>
                  <p className="mt-1 font-medium text-slate-900">{q.question_text}</p>
                  {opts.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {opts.map((o) => (
                        <li
                          key={o.key}
                          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                        >
                          <strong className="mr-2">{o.key}.</strong>
                          {o.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Exam paper builder"
        description={
          exam.title +
          " · " +
          (exam.courses?.code ?? "Course") +
          " - select, order and set marks from the real question bank."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/teacher/examinations">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button variant="outline" disabled={!paper.length} onClick={() => setPreview(true)}>
              <Eye className="mr-1.5 h-4 w-4" />
              Preview as student
            </Button>
            <Button
              variant="outline"
              disabled={!paper.length}
              onClick={() => {
                setIncludeKey(true);
                setTimeout(() => exportPrintable(), 0);
              }}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              Export (with key)
            </Button>
            <Button
              variant="outline"
              disabled={!paper.length}
              onClick={() => {
                setIncludeKey(false);
                setTimeout(() => exportPrintable(), 0);
              }}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              Export / Print
            </Button>
            <Button className="font-semibold" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save paper
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-xs text-slate-500">On paper</p>
          <p className="text-2xl font-extrabold">{paper.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-xs text-slate-500">Total marks</p>
          <p className="text-2xl font-extrabold">{totalMarks}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:col-span-2">
          <Label className="text-xs text-slate-500">Questions students must answer</Label>
          <Input
            type="number"
            min={1}
            className="mt-1 h-9"
            value={questionsToAnswer || paper.length || ""}
            onChange={(e) => setQuestionsToAnswer(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={"Question bank (" + filteredBank.length + ")"}
          description="Search, filter and bulk-select"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={selectAllFiltered}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={clearAll}>
                Clear
              </Button>
            </div>
          }
        >
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              <option value="mcq">MCQ</option>
              <option value="true_false">True/False</option>
              <option value="short_answer">Short answer</option>
              <option value="essay">Essay</option>
            </select>
          </div>

          {bankQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading bank...</p>
          ) : filteredBank.length === 0 ? (
            <EmptyState
              title="No questions in this course bank"
              description="Add questions under Question Bank for this course, then return here."
            />
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
              {filteredBank.map((q) => {
                const on = selectedIds.has(q.id);
                return (
                  <li key={q.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-xl border px-3 py-3 text-sm",
                        on ? "border-primary/40 bg-primary/5" : "border-slate-200",
                      )}
                    >
                      <Checkbox checked={on} onCheckedChange={() => toggle(q.id)} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold uppercase text-slate-500">
                          {q.question_type.replaceAll("_", " ")} · {q.marks} mark(s)
                        </span>
                        <span className="mt-1 block font-medium text-slate-900">{q.question_text}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={"Paper composition (" + paper.length + ")"}
          description="Reorder and set marks per question"
        >
          {paper.length === 0 ? (
            <EmptyState title="Empty paper" description="Select questions from the bank." />
          ) : (
            <ul className="space-y-2">
              {paper.map((p, idx) => {
                const q = bank.find((b) => b.id === p.question_id);
                return (
                  <li
                    key={p.question_id}
                    className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <span className="mt-1 w-6 text-xs font-bold text-slate-400">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {q?.question_text ?? "(missing question)"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {q?.question_type?.replaceAll("_", " ") ?? "-"}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Label className="text-xs">Marks</Label>
                        <Input
                          type="number"
                          min={0.5}
                          step={0.5}
                          className="h-8 w-20"
                          value={p.marks}
                          onChange={(e) => setMarks(p.question_id, Number(e.target.value) || 1)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
