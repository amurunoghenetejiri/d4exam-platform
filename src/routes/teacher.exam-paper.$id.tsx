import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Search } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/exam-paper/$id")({
  head: () => ({ meta: [{ title: "Exam paper — D4EXAM" }] }),
  component: Page,
});

type Exam = {
  id: string;
  title: string;
  course_id: string | null;
  school_id: string;
  status: string;
  courses: { code: string; name: string } | null;
};

type Q = {
  id: string;
  question_text: string;
  question_type: string | null;
  marks: number | null;
  status?: string | null;
};

type PaperItem = { question_id: string; question_order: number; marks: number };

function Page() {
  const { id } = Route.useParams();
  const { data: teacher } = useTeacherContext();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [paper, setPaper] = useState<PaperItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const examQ = useQuery({
    queryKey: ["teacher-exam-paper", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, course_id, school_id, status, courses(code, name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
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
        .select("id, question_text, question_type, marks, status")
        .eq("school_id", exam.school_id)
        .eq("course_id", exam.course_id!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as Q[];
      const active = rows.filter((r) => !r.status || ["active", "approved"].includes(String(r.status)));
      return active.length ? active : rows;
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
      setPaper(
        linksQ.data.map((l) => ({
          question_id: l.question_id,
          question_order: l.question_order,
          marks: l.marks ?? bankQ.data!.find((b) => b.id === l.question_id)?.marks ?? 1,
        })),
      );
      setLoaded(true);
    }
  }, [linksQ.data, bankQ.data, loaded]);

  const bank = bankQ.data ?? [];
  const selectedIds = useMemo(() => new Set(paper.map((p) => p.question_id)), [paper]);
  const filteredBank = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bank;
    return bank.filter((row) => row.question_text.toLowerCase().includes(q));
  }, [bank, search]);

  function toggle(qid: string) {
    setPaper((prev) => {
      if (prev.some((p) => p.question_id === qid)) {
        return prev.filter((p) => p.question_id !== qid).map((p, i) => ({ ...p, question_order: i + 1 }));
      }
      const q = bank.find((b) => b.id === qid);
      return [...prev, { question_id: qid, question_order: prev.length + 1, marks: q?.marks ?? 1 }];
    });
  }

  function selectAllFiltered() {
    setPaper((prev) => {
      const map = new Map(prev.map((p) => [p.question_id, p]));
      for (const q of filteredBank) {
        if (!map.has(q.id)) {
          map.set(q.id, { question_id: q.id, question_order: map.size + 1, marks: q.marks ?? 1 });
        }
      }
      return [...map.values()].map((p, i) => ({ ...p, question_order: i + 1 }));
    });
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
      toast.success(`Paper saved: ${rows.length} question(s)`);
      await linksQ.refetch();
      await qc.invalidateQueries({ queryKey: ["cbt-questions"] });
      await qc.invalidateQueries({ queryKey: ["teacher-exams"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not save paper");
    } finally {
      setBusy(false);
    }
  }

  const exam = examQ.data;
  if (examQ.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!exam) return <EmptyState title="Exam not found" description="It may have been deleted." />;

  return (
    <>
      <PageHeader
        title="Exam paper builder"
        description={`${exam.title} · ${exam.courses?.code ?? "Course"} — select questions from the bank.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/teacher/examinations">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button className="font-semibold" disabled={busy || !paper.length} onClick={() => void save()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save paper ({paper.length})
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Question bank (${filteredBank.length})`}>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-8" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
              Select all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPaper([])}>
              Clear
            </Button>
          </div>
          {bankQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading bank…</p>
          ) : filteredBank.length === 0 ? (
            <EmptyState title="No questions in bank" description="Add questions under Question Bank first." />
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
              {filteredBank.map((q) => {
                const on = selectedIds.has(q.id);
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => toggle(q.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm",
                        on ? "border-primary bg-primary/5" : "border-slate-200 bg-white",
                      )}
                    >
                      <Checkbox checked={on} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-3 font-medium text-slate-900">{q.question_text}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">
                          {(q.question_type || "mcq").replaceAll("_", " ")} · {q.marks ?? 1} mk
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Paper (${paper.length} selected)`}>
          {paper.length === 0 ? (
            <p className="text-sm text-slate-500">Select questions from the bank, then Save paper.</p>
          ) : (
            <ol className="max-h-[28rem] space-y-2 overflow-y-auto">
              {paper.map((p, i) => {
                const q = bank.find((b) => b.id === p.question_id);
                return (
                  <li key={p.question_id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Q{i + 1}</p>
                    <p className="mt-0.5 font-medium text-slate-900">{q?.question_text ?? p.question_id}</p>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-4">
            <Button className="w-full font-semibold" disabled={busy || !paper.length} onClick={() => void save()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save paper
            </Button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
