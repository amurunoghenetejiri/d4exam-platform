import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/exam-paper/$id")({
  head: () => ({
    meta: [{ title: "Exam paper — D4EXAM" }],
  }),
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
  question_type: string;
  marks: number;
};

function Page() {
  const { id } = Route.useParams();
  const { data: teacher } = useTeacherContext();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
        .select("id, question_text, question_type, marks")
        .eq("school_id", exam.school_id)
        .eq("course_id", exam.course_id!)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Q[];
    },
  });

  const linksQ = useQuery({
    queryKey: ["paper-links", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select("question_id, question_order")
        .eq("exam_id", id)
        .order("question_order");
      if (error) throw error;
      return (data ?? []) as { question_id: string; question_order: number }[];
    },
  });

  useEffect(() => {
    if (linksQ.data && !loaded) {
      setSelected(new Set(linksQ.data.map((l) => l.question_id)));
      setLoaded(true);
    }
  }, [linksQ.data, loaded]);

  const bank = bankQ.data ?? [];

  function toggle(qid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  }

  async function save() {
    if (!teacher || !examQ.data) return;
    if (["ongoing", "completed", "closed"].includes(examQ.data.status)) {
      toast.error("Cannot change paper for a live/completed exam");
      return;
    }
    setBusy(true);
    try {
      await supabase.from("exam_questions").delete().eq("exam_id", id);
      const rows = [...selected].map((question_id, i) => {
        const q = bank.find((b) => b.id === question_id);
        return {
          exam_id: id,
          question_id,
          question_order: i + 1,
          marks: q?.marks ?? 1,
        };
      });
      if (rows.length) {
        const { error } = await supabase.from("exam_questions").insert(rows as never);
        if (error) throw error;
      }
      toast.success(`${rows.length} question(s) on this exam paper`);
      await linksQ.refetch();
      await qc.invalidateQueries({ queryKey: ["cbt-questions"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not save paper");
    } finally {
      setBusy(false);
    }
  }

  const exam = examQ.data;

  if (examQ.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!exam) {
    return <EmptyState title="Exam not found" description="It may have been deleted." />;
  }

  return (
    <>
      <PageHeader
        title="Exam paper"
        description={`${exam.title} · ${exam.courses?.code ?? "Course"} — pick questions from the bank for THIS exam only (not every course exam).`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/teacher/examinations">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <SectionCard
        title={`Question bank (${bank.length})`}
        description={`${selected.size} selected for this paper`}
        action={
          <Button className="font-semibold" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save paper
          </Button>
        }
      >
        {bankQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading bank…</p>
        ) : bank.length === 0 ? (
          <EmptyState
            title="No questions in this course bank"
            description="Add questions under Question Bank for this course, then return here."
          />
        ) : (
          <ul className="space-y-2">
            {bank.map((q) => {
              const on = selected.has(q.id);
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
    </>
  );
}
