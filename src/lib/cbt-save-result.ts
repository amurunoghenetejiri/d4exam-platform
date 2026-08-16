import { supabase } from "@/integrations/supabase/client";
import { scoreObjectiveAnswers } from "@/lib/cbt-security";

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
    await supabase
      .from("exam_attempts")
      .update({
        status,
        submitted_at: new Date().toISOString(),
        score: scored.totalScore,
        max_score: scored.maxMarks,
        answers: input.answers,
      } as never)
      .eq("id", input.attemptId);
  }

  const { data, error } = await supabase
    .from("results")
    .upsert(
      {
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
      } as never,
      { onConflict: "exam_id,student_id" },
    )
    .select("id")
    .maybeSingle();

  return { scored, error, resultId: data?.id as string | undefined, status };
}
