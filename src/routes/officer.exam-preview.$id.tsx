import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, FileQuestion } from "lucide-react";
import { toast } from "sonner";
import { ExamSecurityGate } from "@/components/cbt/ExamSecurityGate";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fromExamSettingsRow, type ExamSettingsRow } from "@/lib/exam-security";
import { formatExamWindow } from "@/lib/student";
import { parseExamMeta, pickExamQuestions } from "@/lib/exam-meta";

export const Route = createFileRoute("/officer/exam-preview/$id")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Exam security preview — D4EXAM" }],
  }),
  component: OfficerExamPreview,
});

type QRow = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  correct_answer: string | null;
  explanation: string | null;
};

function decodeOptions(explanation: string | null): string[] {
  if (!explanation) return [];
  const optLine = explanation.split("\n").find((l) => l.startsWith("OPTIONS::"));
  if (!optLine) return [];
  const body = optLine.slice("OPTIONS::".length);
  const map: Record<string, string> = {};
  for (const part of body.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0) map[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1);
  }
  return ["A", "B", "C", "D"].map((k) => map[k]).filter(Boolean) as string[];
}

function OfficerExamPreview() {
  const { id } = Route.useParams();

  const examQ = useQuery({
    queryKey: ["officer-exam-preview", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, status, duration_minutes, scheduled_start, scheduled_end, description, school_id, course_id, courses(code, name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settingsQ = useQuery({
    queryKey: ["officer-exam-preview-settings", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const cols =
        "require_camera, face_detection, max_face_warnings, require_microphone, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, screen_share_mode, threshold_action, face_violation_action, require_screen_share, randomize_questions, randomize_options, questions_to_answer";
      const { data, error } = await supabase
        .from("exam_settings")
        .select(cols)
        .eq("exam_id", id)
        .maybeSingle();
      if (error) {
        const { data: d2 } = await supabase
          .from("exam_settings")
          .select(
            "require_camera, face_detection, max_face_warnings, require_microphone, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, threshold_action",
          )
          .eq("exam_id", id)
          .maybeSingle();
        return d2;
      }
      return data;
    },
  });

  // Same source as student CBT: exam_questions links, else course question bank
  const questionsQ = useQuery({
    queryKey: ["officer-exam-preview-questions", id, examQ.data?.course_id, examQ.data?.school_id],
    enabled: Boolean(examQ.data?.id && examQ.data?.school_id),
    queryFn: async () => {
      const exam = examQ.data!;
      const { data: links } = await supabase
        .from("exam_questions")
        .select("question_id, question_order, marks")
        .eq("exam_id", exam.id)
        .order("question_order", { ascending: true });
      const linkIds = (links ?? []).map((l) => (l as { question_id: string }).question_id);
      if (linkIds.length > 0) {
        const { data, error } = await supabase
          .from("questions")
          .select("id, question_text, question_type, marks, correct_answer, explanation")
          .in("id", linkIds)
          .eq("status", "active");
        if (error) throw error;
        const byId = new Map((data ?? []).map((q) => [q.id as string, q as QRow]));
        return linkIds.map((qid) => byId.get(qid)).filter(Boolean) as QRow[];
      }
      if (!exam.course_id) return [] as QRow[];
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, question_type, marks, correct_answer, explanation")
        .eq("school_id", exam.school_id)
        .eq("course_id", exam.course_id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as QRow[];
    },
  });

  const security = useMemo(
    () => fromExamSettingsRow(settingsQ.data as ExamSettingsRow | null, examQ.data?.description),
    [settingsQ.data, examQ.data?.description],
  );

  const questionsToAnswer = useMemo(() => {
    const fromSettings = (settingsQ.data as { questions_to_answer?: number | null } | null)
      ?.questions_to_answer;
    if (typeof fromSettings === "number" && fromSettings > 0) return Math.floor(fromSettings);
    const meta = parseExamMeta(examQ.data?.description);
    return meta.questionsToAnswer && meta.questionsToAnswer > 0 ? meta.questionsToAnswer : null;
  }, [settingsQ.data, examQ.data?.description]);

  const paperQuestions = useMemo(() => {
    const bank = (questionsQ.data ?? []).map((q) => {
      let opts = decodeOptions(q.explanation);
      if (
        opts.length === 0 &&
        (q.question_type === "true_false" || q.question_type === "True/False")
      ) {
        opts = ["True", "False"];
      }
      if (opts.length === 0) opts = ["Option A", "Option B", "Option C", "Option D"];
      return { ...q, options: opts };
    });
    return pickExamQuestions(bank, {
      questionsToAnswer,
      randomize: false,
      studentKey: "officer-preview",
      examId: id,
    });
  }, [questionsQ.data, questionsToAnswer, id]);

  const totalQ = paperQuestions.length;
  const bankTotal = questionsQ.data?.length ?? 0;

  if (examQ.isLoading || settingsQ.isLoading || questionsQ.isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
        </p>
      </div>
    );
  }

  const exam = examQ.data;
  if (!exam) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div>
          <p className="font-bold">Examination not found</p>
          <Button className="mt-4" asChild>
            <Link to="/officer/approvals">Back to approvals</Link>
          </Button>
        </div>
      </div>
    );
  }

  const course = exam.courses as { code?: string; name?: string } | null;
  const courseLine = `${course?.code ?? ""} · ${course?.name ?? ""}`;

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
        Officer preview — same security checks and question paper students will see. Starting does not
        create a real attempt.
      </div>
      <div className="mx-auto max-w-3xl px-4 py-3">
        <Button variant="ghost" size="sm" className="text-base" asChild>
          <Link to="/officer/approvals">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to approvals
          </Link>
        </Button>
      </div>

      <ExamSecurityGate
        examTitle={exam.title}
        courseLine={courseLine}
        durationMinutes={exam.duration_minutes ?? 60}
        totalQuestions={totalQ}
        security={security}
        busy={false}
        continueMode={false}
        windowLabel={formatExamWindow(exam.scheduled_start, exam.scheduled_end)}
        onStart={() => {
          toast.success(
            "Preview complete. Camera / face / fullscreen behave as on the student side. Request changes if anything must be adjusted.",
          );
          document.getElementById("officer-sample-paper")?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <div id="officer-sample-paper" className="mx-auto max-w-3xl px-4 pb-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileQuestion className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 sm:text-lg">
                Sample question paper
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {totalQ === 0
                  ? "No questions found for this exam yet. Link questions or add them to the course bank before approving."
                  : questionsToAnswer != null && bankTotal > totalQ
                    ? `Students answer ${totalQ} of ${bankTotal} bank questions (random subset when shuffle is on).`
                    : `${totalQ} question${totalQ === 1 ? "" : "s"} on this paper.`}
              </p>
            </div>
          </div>

          {totalQ === 0 ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              Fix: attach questions via exam question links or ensure the course has active questions
              in the bank.
            </p>
          ) : (
            <ol className="mt-5 space-y-4">
              {paperQuestions.map((q, i) => (
                <li
                  key={q.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:p-4"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Question {i + 1}
                    {q.marks != null ? ` · ${q.marks} mark${q.marks === 1 ? "" : "s"}` : ""}
                    {q.question_type ? ` · ${q.question_type}` : ""}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-900">{q.question_text}</p>
                  <ul className="mt-3 space-y-1.5">
                    {(q.options ?? []).map((opt, oi) => (
                      <li
                        key={oi}
                        className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500">
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <span>{opt}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
