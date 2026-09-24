import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Loader2, Save, ClipboardCheck } from "lucide-react";
import { PageHeader, SectionCard, EmptyState, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTeacherContext } from "@/lib/teacher";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { resolveStudentDetails } from "@/lib/resolve-student-details";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/marking")({
  head: () => ({
    meta: [{ title: "Marking — D4EXAM" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    examId: typeof search.examId === "string" ? search.examId : undefined,
    attemptId: typeof search.attemptId === "string" ? search.attemptId : undefined,
  }),
  component: Page,
});

type AttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  submitted_at: string | null;
  answers: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

type PaperQ = {
  question_id: string;
  marks: number;
  question_text: string;
  question_type: string;
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
  const { data: teacher, isLoading: teacherLoading } = useTeacherContext();
  const { data: session } = useSessionUser();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const examId = search.examId;
  const attemptId = search.attemptId;

  const [marksMap, setMarksMap] = useState<Record<string, number>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // —— Step 0: list essay exams if no examId ——
  const examsQ = useQuery({
    queryKey: ["teacher-marking-exams", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId) && !examId,
    queryFn: async () => {
      if (!teacher?.schoolId) return [] as { id: string; title: string; pending: number }[];
      let examQ = supabase
        .from("examinations")
        .select("id, title, course_id")
        .eq("school_id", teacher.schoolId)
        .limit(200);
      if (teacher.courseIds?.length) {
        examQ = examQ.in("course_id", teacher.courseIds);
      }
      const { data: exams } = await examQ;
      const list = exams ?? [];
      if (!list.length) return [];

      const ids = list.map((e) => e.id as string);
      const essaySet = new Set<string>();
      try {
        const { data: links } = await supabase
          .from("exam_questions")
          .select("exam_id, question_id")
          .in("exam_id", ids)
          .limit(4000);
        const qids = [...new Set((links ?? []).map((l) => String(l.question_id)).filter(Boolean))];
        if (qids.length) {
          const { data: qs } = await supabase.from("questions").select("id, question_type").in("id", qids);
          const essayQ = new Set(
            (qs ?? []).filter((q) => isEssayType(String((q as { question_type?: string }).question_type))).map((q) => String((q as { id: string }).id)),
          );
          for (const l of links ?? []) {
            if (essayQ.has(String(l.question_id))) essaySet.add(String(l.exam_id));
          }
        }
      } catch {
        /* if detection fails, show all exams with submissions */
      }

      const target = essaySet.size ? ids.filter((id) => essaySet.has(id)) : ids;
      if (!target.length) return [];

      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, status, metadata")
        .eq("school_id", teacher.schoolId)
        .in("exam_id", target)
        .in("status", ["submitted", "terminated", "flagged"])
        .limit(2000);

      const pendingByExam = new Map<string, number>();
      for (const a of attempts ?? []) {
        const meta = (a.metadata || {}) as Record<string, unknown>;
        const marked = meta.essay_marked === true || meta.subjective_marked === true;
        if (!marked) pendingByExam.set(a.exam_id, (pendingByExam.get(a.exam_id) || 0) + 1);
      }

      return target.map((id) => {
        const title = list.find((e) => e.id === id)?.title || "Examination";
        return { id, title, pending: pendingByExam.get(id) || 0 };
      });
    },
  });

  // —— Step 1: students for selected exam ——
  const attemptsQ = useQuery({
    queryKey: ["teacher-marking-attempts", teacher?.schoolId, examId],
    enabled: Boolean(teacher?.schoolId && examId),
    queryFn: async () => {
      if (!teacher?.schoolId || !examId) return [] as (AttemptRow & { fullName: string; matric: string })[];
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, student_id, status, submitted_at, answers, metadata")
        .eq("school_id", teacher.schoolId)
        .eq("exam_id", examId)
        .in("status", ["submitted", "terminated", "flagged"])
        .order("submitted_at", { ascending: false })
        .limit(500);
      if (error) {
        console.warn("[marking] attempts", error.message);
        return [];
      }
      const rows = (data ?? []) as AttemptRow[];
      const ids = rows.map((r) => r.student_id).filter(Boolean);
      const details = await resolveStudentDetails(teacher.schoolId, ids);
      return rows.map((r) => {
        const d = details[r.student_id];
        return {
          ...r,
          fullName: d?.fullName || "Student",
          matric: d?.matric || "—",
        };
      });
    },
  });

  const examTitleQ = useQuery({
    queryKey: ["teacher-marking-exam-title", examId],
    enabled: Boolean(examId),
    queryFn: async () => {
      if (!examId) return "Examination";
      const { data } = await supabase.from("examinations").select("title").eq("id", examId).maybeSingle();
      return data?.title || "Examination";
    },
  });

  const active = useMemo(() => {
    if (!attemptId) return null;
    return (attemptsQ.data ?? []).find((a) => a.id === attemptId) || null;
  }, [attemptId, attemptsQ.data]);

  // —— Step 2: paper questions for active attempt ——
  const paperQ = useQuery({
    queryKey: ["teacher-marking-paper", examId, attemptId],
    enabled: Boolean(examId && attemptId),
    queryFn: async () => {
      if (!examId) return [] as PaperQ[];
      const { data: links, error } = await supabase
        .from("exam_questions")
        .select("question_id, marks")
        .eq("exam_id", examId)
        .limit(200);
      if (error) {
        console.warn("[marking] paper links", error.message);
        return [];
      }
      const qids = (links ?? []).map((l) => String(l.question_id)).filter(Boolean);
      if (!qids.length) return [];
      const { data: qs } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks")
        .in("id", qids);
      const qmap = new Map((qs ?? []).map((q) => [String((q as { id: string }).id), q as {
        id: string;
        question_text: string;
        question_type: string;
        marks: number;
      }]));
      return (links ?? []).map((l) => {
        const q = qmap.get(String(l.question_id));
        return {
          question_id: String(l.question_id),
          marks: Number(l.marks || q?.marks || 0),
          question_text: q?.question_text || "Question",
          question_type: q?.question_type || "",
        };
      });
    },
  });

  const subjective = useMemo(
    () => (paperQ.data ?? []).filter((q) => isEssayType(q.question_type)),
    [paperQ.data],
  );

  useEffect(() => {
    if (!active || !subjective.length) return;
    const meta = (active.metadata || {}) as Record<string, unknown>;
    const existing = (meta.subjective_marks || meta.essay_marks || {}) as Record<string, number>;
    const next: Record<string, number> = {};
    for (const q of subjective) {
      if (existing[q.question_id] != null) next[q.question_id] = Number(existing[q.question_id]);
    }
    setMarksMap(next);
    setFeedbackMap({});
  }, [active?.id, subjective.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const objectiveScore = Number(
    ((active?.metadata as { score?: { totalScore?: number } } | null)?.score?.totalScore) ?? 0,
  );
  const subjectiveTotal = useMemo(
    () => subjective.reduce((s, q) => s + (Number(marksMap[q.question_id]) || 0), 0),
    [subjective, marksMap],
  );
  const maxSubjective = useMemo(
    () => subjective.reduce((s, q) => s + (Number(q.marks) || 0), 0),
    [subjective],
  );

  async function saveMarks() {
    if (!teacher || !session || !active || !examId) return;
    setBusy(true);
    try {
      for (const q of subjective) {
        const awarded = Number(marksMap[q.question_id] ?? 0);
        const max = Number(q.marks || 0);
        try {
          await supabase.from("attempt_marks").upsert(
            {
              school_id: teacher.schoolId,
              attempt_id: active.id,
              exam_id: examId,
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
        } catch {
          /* table may not have unique constraint — continue */
        }
      }

      const maxScore =
        Number(
          ((active.metadata as { score?: { maxScore?: number } } | null)?.score?.maxScore) ?? 0,
        ) || objectiveScore + maxSubjective;
      const finalScore = objectiveScore + subjectiveTotal;
      const percentage = maxScore > 0 ? Math.round((finalScore / maxScore) * 1000) / 10 : 0;
      const grade =
        percentage >= 70 ? "A" : percentage >= 60 ? "B" : percentage >= 50 ? "C" : percentage >= 40 ? "D" : "F";

      const nextMeta = {
        ...(active.metadata || {}),
        essay_marked: true,
        subjective_marked: true,
        subjective_marks: marksMap,
        score: {
          ...(((active.metadata as { score?: Record<string, unknown> })?.score) || {}),
          totalScore: finalScore,
          maxScore,
          percentage,
          grade,
        },
      };

      await supabase
        .from("exam_attempts")
        .update({ metadata: nextMeta } as never)
        .eq("id", active.id);

      // Upsert into examination_results / results if present
      try {
        const payload = {
          school_id: teacher.schoolId,
          exam_id: examId,
          student_id: active.student_id,
          attempt_id: active.id,
          score: finalScore,
          max_score: maxScore,
          percentage,
          grade,
          status: "marked",
          released: false,
        };
        const tryTables = ["examination_results", "exam_results", "results"] as const;
        for (const table of tryTables) {
          try {
            const { error } = await supabase.from(table).upsert(payload as never, {
              onConflict: "exam_id,student_id",
            });
            if (!error) break;
          } catch {
            /* try next */
          }
        }
      } catch {
        /* results table optional */
      }

      toast.success("Marks saved — ready for officer release");
      void qc.invalidateQueries({ queryKey: ["teacher-marking-attempts"] });
      void qc.invalidateQueries({ queryKey: ["teacher-submissions-by-exam"] });
      void navigate({ to: "/teacher/marking", search: { examId } });
    } catch (e) {
      console.error(e);
      toast.error("Could not save marks. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function answerFor(qid: string): string {
    const ans = active?.answers;
    if (!ans || typeof ans !== "object") return "";
    const raw = (ans as Record<string, unknown>)[qid];
    if (raw == null) return "";
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null && "text" in raw) {
      return String((raw as { text?: string }).text || "");
    }
    return String(raw);
  }

  if (teacherLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!teacher) {
    return (
      <>
        <PageHeader title="Marking" description="Essay / theory scripts" />
        <EmptyState title="Teacher profile not found" description="Your account is not linked as a teacher for this school." />
      </>
    );
  }

  // —— View: no exam selected ——
  if (!examId) {
    const rows = examsQ.data ?? [];
    return (
      <>
        <PageHeader
          title="Marking"
          description="Select an examination that needs essay or theory marking."
        />
        <SectionCard title="Exams requiring marking" className="mt-2">
          {examsQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !rows.length ? (
            <EmptyState
              title="No scripts waiting"
              description="When students submit exams with essay questions, they appear here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-slate-50"
                    onClick={() => void navigate({ to: "/teacher/marking", search: { examId: r.id } })}
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{r.title}</p>
                      <p className="text-xs text-slate-500">
                        {r.pending ? `${r.pending} waiting for marking` : "All marked"}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              <Link to="/teacher/submissions">Back to submissions</Link>
            </Button>
          </div>
        </SectionCard>
      </>
    );
  }

  // —— View: student list for exam ——
  if (!attemptId) {
    const rows = attemptsQ.data ?? [];
    return (
      <>
        <PageHeader
          title={examTitleQ.data || "Mark scripts"}
          description="Select a student to mark their essay / theory answers."
        />
        <div className="mb-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-primary"
            onClick={() => void navigate({ to: "/teacher/marking" })}
          >
            <ArrowLeft className="h-4 w-4" /> All exams
          </Button>
        </div>
        <SectionCard title="Submitted students" className="mt-1">
          {attemptsQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !rows.length ? (
            <EmptyState title="No submissions yet" description="No submitted scripts for this examination." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((a) => {
                const marked =
                  (a.metadata as { essay_marked?: boolean })?.essay_marked === true ||
                  (a.metadata as { subjective_marked?: boolean })?.subjective_marked === true;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-slate-50"
                      onClick={() =>
                        void navigate({
                          to: "/teacher/marking",
                          search: { examId, attemptId: a.id },
                        })
                      }
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{a.fullName}</p>
                        <p className="text-xs text-slate-500">{a.matric}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={marked ? "Marked" : "Needs marking"} />
                        <ChevronRight className="h-5 w-5 text-slate-400" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </>
    );
  }

  // —— View: mark one student ——
  if (!active && !attemptsQ.isLoading) {
    return (
      <>
        <PageHeader title="Script not found" description="This attempt could not be loaded." />
        <Button
          type="button"
          variant="outline"
          onClick={() => void navigate({ to: "/teacher/marking", search: { examId } })}
        >
          Back to students
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={active?.fullName || "Marking"}
        description={`${active?.matric || ""} · ${examTitleQ.data || "Examination"}`}
      />
      <div className="mb-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-primary"
          onClick={() => void navigate({ to: "/teacher/marking", search: { examId } })}
        >
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Button>
      </div>

      <SectionCard
        title="Essay / theory answers"
        className="mt-1"
        action={
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Manual marking
          </span>
        }
      >
        {paperQ.isLoading || attemptsQ.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !subjective.length ? (
          <EmptyState
            title="No essay questions"
            description="This paper has no essay/theory items to mark manually."
          />
        ) : (
          <div className="space-y-5">
            {subjective.map((q, idx) => {
              const max = Number(q.marks) || 0;
              const ans = answerFor(q.question_id);
              return (
                <div
                  key={q.question_id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    Question {idx + 1} · max {max}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900 whitespace-pre-wrap">
                    {q.question_text}
                  </p>
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-800 whitespace-pre-wrap">
                    {ans || <em className="text-slate-400">No answer submitted</em>}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                    <div className="space-y-1">
                      <Label className="text-xs">Feedback (optional)</Label>
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-800">
                Auto {objectiveScore} + Manual {subjectiveTotal} ={" "}
                <span className="text-primary">{objectiveScore + subjectiveTotal}</span>
                {maxSubjective ? (
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    (essay max {maxSubjective})
                  </span>
                ) : null}
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
    </>
  );
}
