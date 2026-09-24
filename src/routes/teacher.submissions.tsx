import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, ChevronRight, Loader2 } from "lucide-react";
import { PageHeader, SectionCard, EmptyState, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/teacher/submissions")({
  head: () => ({
    meta: [{ title: "Submissions — D4EXAM" }],
  }),
  component: Page,
});

type AttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  submitted_at: string | null;
  metadata?: Record<string, unknown> | null;
  examinations: { id: string; title: string; course_id: string | null } | null;
};

function isEssayType(ty: string): boolean {
  const t = (ty || "").toLowerCase();
  return (
    t.includes("essay") ||
    t.includes("short") ||
    t.includes("theory") ||
    t.includes("descript") ||
    t === "numerical"
  );
}

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();

  const dataQ = useQuery({
    queryKey: ["teacher-submissions-by-exam", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher?.courseIds?.length),
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!teacher) return [] as { examId: string; title: string; total: number; marked: number; pending: number }[];
      const { data: exams } = await supabase
        .from("examinations")
        .select("id, title, course_id")
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds)
        .limit(200);
      const examList = exams ?? [];
      if (!examList.length) return [];

      const examIds = examList.map((e) => e.id as string);

      // Detect essay exams
      const essayExamIds = new Set<string>();
      try {
        const { data: links } = await supabase
          .from("exam_questions")
          .select("exam_id, question_id")
          .in("exam_id", examIds)
          .limit(3000);
        const qids = [...new Set((links ?? []).map((l) => String(l.question_id)).filter(Boolean))];
        if (qids.length) {
          const { data: qs } = await supabase.from("questions").select("id, question_type").in("id", qids);
          const essayQ = new Set(
            (qs ?? [])
              .filter((q) => isEssayType(String((q as { question_type?: string }).question_type || "")))
              .map((q) => String((q as { id: string }).id)),
          );
          for (const l of links ?? []) {
            if (essayQ.has(String(l.question_id))) essayExamIds.add(String(l.exam_id));
          }
        }
      } catch {
        /* if detection fails, treat all as possible marking */
      }

      const targetExamIds = essayExamIds.size ? [...essayExamIds] : examIds;

      const { data: attempts, error } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, student_id, status, submitted_at, metadata")
        .eq("school_id", teacher.schoolId)
        .in("exam_id", targetExamIds)
        .in("status", ["submitted", "terminated", "flagged", "completed", "graded"])
        .limit(500);
      if (error) throw error;

      const byExam = new Map<string, AttemptRow[]>();
      for (const a of (attempts ?? []) as AttemptRow[]) {
        const list = byExam.get(a.exam_id) || [];
        list.push(a);
        byExam.set(a.exam_id, list);
      }

      const titleMap = new Map(examList.map((e) => [e.id as string, e.title as string]));
      const out: { examId: string; title: string; total: number; marked: number; pending: number }[] = [];
      for (const examId of targetExamIds) {
        const list = byExam.get(examId) || [];
        if (!list.length && essayExamIds.size && !essayExamIds.has(examId)) continue;
        if (!list.length && essayExamIds.size) continue; // only show exams with attempts
        let marked = 0;
        for (const a of list) {
          if (a.metadata && (a.metadata as { essayMarked?: boolean }).essayMarked) marked += 1;
        }
        out.push({
          examId,
          title: titleMap.get(examId) || "Examination",
          total: list.length,
          marked,
          pending: Math.max(0, list.length - marked),
        });
      }
      // Prefer exams with pending marks first
      out.sort((a, b) => b.pending - a.pending || b.total - a.total);
      return out;
    },
  });

  const rows = dataQ.data ?? [];

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (!teacher) {
    return <EmptyState title="Teacher profile not found" description="Contact School Admin." />;
  }

  return (
    <>
      <PageHeader
        title="Submissions & Marking"
        description="Exams that need essay / theory marking. Open an exam to mark student scripts."
      />

      <SectionCard
        title="Exams requiring marking"
        description="Only papers with essay, short-answer or theory questions"
      >
        {dataQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading exams…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No exams to mark"
            description="When students submit papers that include essay questions on your courses, they appear here."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.examId}>
                <Link
                  to="/teacher/marking"
                  search={{ examId: r.examId }}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      {r.total} submission{r.total === 1 ? "" : "s"} ·{" "}
                      <span className={r.pending ? "font-semibold text-amber-700" : "text-emerald-700"}>
                        {r.pending ? `${r.pending} waiting for marking` : "All marked"}
                      </span>
                      {r.marked ? ` · ${r.marked} marked` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="mt-4">
        <Button variant="outline" asChild>
          <Link to="/teacher/marking">Open marking center</Link>
        </Button>
      </div>
    </>
  );
}
