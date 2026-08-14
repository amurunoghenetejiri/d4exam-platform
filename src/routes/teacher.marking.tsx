import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { PageHeader, SectionCard, EmptyState, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTeacherContext } from "@/lib/teacher";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/marking")({
  head: () => ({
    meta: [
      { title: "Marking Center — D4EXAM" },
      { name: "description", content: "Mark subjective answers for your assigned courses." },
    ],
  }),
  component: Page,
});

type AttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  submitted_at: string | null;
  answers: Record<string, string> | null;
  metadata: { score?: { totalScore?: number; maxScore?: number } } | null;
  examinations: { id: string; title: string; course_id: string | null; school_id: string } | null;
  students: { id: string; full_name: string | null; matric_number: string | null; student_id: string } | null;
};

type PaperQ = {
  question_id: string;
  marks: number;
  questions: {
    id: string;
    question_text: string;
    question_type: string;
    marks: number;
  } | null;
};

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [marksMap, setMarksMap] = useState<Record<string, number>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const attemptsQ = useQuery({
    queryKey: ["teacher-marking-attempts", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    queryFn: async () => {
      if (!teacher) return [] as AttemptRow[];
      const { data: exams } = await supabase
        .from("examinations")
        .select("id")
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds);
      const examIds = (exams ?? []).map((e) => e.id as string);
      if (!examIds.length) return [];

      const { data, error } = await supabase
        .from("exam_attempts")
        .select(
          `id, exam_id, student_id, status, submitted_at, answers, metadata,
           examinations(id, title, course_id, school_id),
           students(id, full_name, matric_number, student_id)`,
        )
        .eq("school_id", teacher.schoolId)
        .in("exam_id", examIds)
        .in("status", ["submitted", "terminated", "flagged"])
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const active = (attemptsQ.data ?? []).find((a) => a.id === activeId) ?? null;

  const paperQ = useQuery({
    queryKey: ["marking-paper", active?.exam_id],
    enabled: Boolean(active?.exam_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_questions")
        .select("question_id, marks, questions(id, question_text, question_type, marks)")
        .eq("exam_id", active!.exam_id)
        .order("question_order");
      if (error) throw error;
      return (data ?? []) as PaperQ[];
    },
  });

  const subjective = useMemo(() => {
    const rows = paperQ.data ?? [];
    return rows.filter((r) => {
      const t = (r.questions?.question_type || "").toLowerCase();
      return t === "essay" || t === "short_answer" || t === "numerical";
    });
  }, [paperQ.data]);

  const objectiveScore = Number(active?.metadata?.score?.totalScore ?? 0);

  const subjectiveTotal = useMemo(() => {
    return subjective.reduce((s, r) => s + (Number(marksMap[r.question_id]) || 0), 0);
  }, [subjective, marksMap]);

  const maxSubjective = useMemo(() => {
    return subjective.reduce((s, r) => s + (Number(r.marks || r.questions?.marks) || 0), 0);
  }, [subjective]);

  function openAttempt(a: AttemptRow) {
    setActiveId(a.id);
    setMarksMap({});
    setFeedbackMap({});
  }

  async function saveMarks() {
    if (!teacher || !session || !active) return;
    setBusy(true);
    try {
      for (const q of subjective) {
        const awarded = Number(marksMap[q.question_id] ?? 0);
        const max = Number(q.marks || q.questions?.marks || 0);
        await supabase.from("attempt_marks").upsert(
          {
            school_id: teacher.schoolId,
            attempt_id: active.id,
            exam_id: active.exam_id,
            student_id: active.student_id,
            question_id: q.question_id,
            marks_awarded: Math.min(awarded, max),
            max_marks: max,
            feedback: feedbackMap[q.question_id] || null,
            marked_by: session.userId,
            marked_at: new Date().toISOString(),
          } as never,
          { onConflict: "attempt_id,question_id" },
        );
      }

      const finalScore = objectiveScore + subjectiveTotal;
      const maxScore =
        Number(active.metadata?.score?.maxScore ?? 0) || objectiveScore + maxSubjective;
      const percentage = maxScore > 0 ? Math.round((finalScore / maxScore) * 1000) / 10 : 0;
      const grade =
        percentage >= 70
          ? "A"
          : percentage >= 60
            ? "B"
            : percentage >= 50
              ? "C"
              : percentage >= 40
                ? "D"
                : "F";

      await supabase.from("results").upsert(
        {
          school_id: teacher.schoolId,
          exam_id: active.exam_id,
          student_id: active.student_id,
          attempt_id: active.id,
          total_score: finalScore,
          max_score: maxScore,
          percentage,
          grade,
          pass_fail: percentage >= 40 ? "pass" : "fail",
          status: "teacher_reviewed",
          teacher_reviewed_at: new Date().toISOString(),
        } as never,
        { onConflict: "exam_id,student_id" },
      );

      toast.success(`Marked. Final score ${finalScore}/${maxScore} (${percentage}%)`);
      await qc.invalidateQueries({ queryKey: ["teacher-marking-attempts"] });
      await qc.invalidateQueries({ queryKey: ["teacher-results"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not save marks");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return <EmptyState title="Teacher profile not found" description="Contact School Admin." />;
  }

  return (
    <>
      <PageHeader
        title="Marking Center"
        description={`Theory / essay marking for ${teacher.fullName}. MCQ & True/False are auto-scored on submit.`}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard className="lg:col-span-2" title="Submitted scripts">
          {attemptsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading attempts…</p>
          ) : (attemptsQ.data ?? []).length === 0 ? (
            <EmptyState
              title="Nothing to mark"
              description="When students submit on your courses, scripts appear here."
            />
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
              {(attemptsQ.data ?? []).map((a) => {
                const name =
                  a.students?.full_name ||
                  a.students?.matric_number ||
                  a.students?.student_id ||
                  "Student";
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => openAttempt(a)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        activeId === a.id
                          ? "border-primary/40 bg-primary/5"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{name}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {a.examinations?.title ?? "Exam"} ·{" "}
                        {a.submitted_at
                          ? new Date(a.submitted_at).toLocaleString()
                          : "—"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          className="lg:col-span-3"
          title={active ? "Mark script" : "Select a script"}
          description={
            active
              ? `${active.students?.full_name || "Student"} · objective auto-score: ${objectiveScore}`
              : "Choose a submitted attempt on the left"
          }
        >
          {!active ? (
            <EmptyState title="No script selected" description="Pick a submission to mark." />
          ) : paperQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading paper…</p>
          ) : subjective.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                No essay/short-answer questions on this paper. Objective score is already recorded.
              </p>
              <p className="text-sm font-semibold">
                Auto score: {objectiveScore}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {subjective.map((q, i) => {
                const ans = (active.answers ?? {})[q.question_id] || "";
                const max = Number(q.marks || q.questions?.marks || 0);
                return (
                  <div key={q.question_id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Q{i + 1} · {q.questions?.question_type?.replaceAll("_", " ")} · max {max}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {q.questions?.question_text}
                    </p>
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {ans || <em className="text-slate-400">No answer</em>}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Marks awarded</Label>
                        <Input
                          type="number"
                          min={0}
                          max={max}
                          step={0.5}
                          value={marksMap[q.question_id] ?? ""}
                          onChange={(e) =>
                            setMarksMap((m) => ({
                              ...m,
                              [q.question_id]: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-1">
                        <Label className="text-xs">Feedback</Label>
                        <Textarea
                          rows={2}
                          value={feedbackMap[q.question_id] ?? ""}
                          onChange={(e) =>
                            setFeedbackMap((m) => ({
                              ...m,
                              [q.question_id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <p className="text-sm font-semibold text-slate-800">
                  Final: {objectiveScore} (auto) + {subjectiveTotal} (manual) ={" "}
                  {objectiveScore + subjectiveTotal}
                </p>
                <Button className="font-semibold" disabled={busy} onClick={() => void saveMarks()}>
                  {busy ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Save marks & send for release
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
