import { supabase } from "@/integrations/supabase/client";
import { scoreObjectiveAnswers } from "@/lib/cbt-security";
import { friendlyError } from "@/lib/friendly-error";

/** Score answers and upsert into public.results (correct table for student/officer UI). */
export async function saveCbtResult(input: {
  examId: string;
  studentId: string;
  schoolId: string;
  attemptId: string | null;
  questions: {
    id: string;
    marks: number;
    correct_answer: string | null;
    correctOptionText?: string | null;
    options: string[];
  }[];
  answers: Record<string, number>;
  terminated?: boolean;
  faceWarned?: boolean;
}) {
  const scored = scoreObjectiveAnswers(
    input.questions.map((q) => ({
      id: q.id,
      marks: q.marks,
      correct_answer: q.correct_answer,
      correctOptionText: q.correctOptionText,
      options: q.options,
    })),
    input.answers,
  );

  const status = input.terminated ? "terminated" : "submitted";
  const secStatus = input.terminated || input.faceWarned ? "flagged" : "pending";

  if (input.attemptId) {
    const { error: attErr } = await supabase
      .from("exam_attempts")
      .update({
        status,
        submitted_at: new Date().toISOString(),
        score: scored.totalScore,
        max_score: scored.maxMarks,
        answers: input.answers,
      } as never)
      .eq("id", input.attemptId);
    if (attErr) {
      console.warn("exam_attempts update", attErr);
    }
  }

  const payload = {
    exam_id: input.examId,
    student_id: input.studentId,
    school_id: input.schoolId,
    attempt_id: input.attemptId,
    total_score: scored.totalScore,
    max_score: scored.maxMarks,
    percentage: scored.percentage,
    grade: scored.grade,
    pass_fail: scored.passFail,
    correct_count: scored.correct,
    wrong_count: scored.wrong,
    unanswered_count: scored.unanswered,
    status: "pending",
    security_review_status: secStatus,
  };

  let resultId: string | undefined;
  let error: { message?: string } | null = null;

  const upsert = await supabase
    .from("results")
    .upsert(payload as never, { onConflict: "exam_id,student_id" })
    .select("id")
    .maybeSingle();

  if (upsert.error) {
    const existing = await supabase
      .from("results")
      .select("id")
      .eq("exam_id", input.examId)
      .eq("student_id", input.studentId)
      .maybeSingle();

    if (existing.data?.id) {
      const upd = await supabase
        .from("results")
        .update({
          attempt_id: input.attemptId,
          total_score: scored.totalScore,
          max_score: scored.maxMarks,
          percentage: scored.percentage,
          grade: scored.grade,
          pass_fail: scored.passFail,
          correct_count: scored.correct,
          wrong_count: scored.wrong,
          unanswered_count: scored.unanswered,
          status: "pending",
          security_review_status: secStatus,
        } as never)
        .eq("id", existing.data.id)
        .select("id")
        .maybeSingle();
      error = upd.error;
      resultId = upd.data?.id as string | undefined;
    } else {
      const ins = await supabase
        .from("results")
        .insert(payload as never)
        .select("id")
        .maybeSingle();
      error = ins.error;
      resultId = ins.data?.id as string | undefined;
    }
  } else {
    resultId = upsert.data?.id as string | undefined;
  }

  return {
    scored,
    error: error ? { message: friendlyError(error, "Could not save your result. Please try again.") } : null,
    resultId,
    status,
  };
}
