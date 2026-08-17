import { supabase } from "@/integrations/supabase/client";
import { scoreObjectiveAnswers, resolveCorrectOptionText } from "@/lib/cbt-security";
import { friendlyError } from "@/lib/friendly-error";
import type { ResultVisibility } from "@/types";

/** Decode OPTIONS::A=...|B=... from question explanation into ordered option texts. */
function decodeOptionsFromExplanation(explanation: string | null | undefined): string[] {
  if (!explanation) return [];
  const optLine = String(explanation)
    .split("\n")
    .find((l) => l.startsWith("OPTIONS::"));
  if (!optLine) return [];
  const body = optLine.slice("OPTIONS::".length);
  const map: Record<string, string> = {};
  for (const part of body.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0) map[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1);
  }
  return ["A", "B", "C", "D"].map((k) => map[k]).filter(Boolean) as string[];
}

/**
 * Score answers and upsert into public.results.
 * Always re-resolves the correct option TEXT from the DB (original A–D order)
 * so scoring stays correct even when the student UI shuffled options.
 */
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
    originalOptions?: string[];
    options: string[];
  }[];
  answers: Record<string, number>;
  terminated?: boolean;
  faceWarned?: boolean;
  resultVisibility?: ResultVisibility | string | null;
}) {
  const qIds = input.questions.map((q) => q.id).filter(Boolean);
  const bankById = new Map<
    string,
    { correct_answer: string | null; explanation: string | null; marks: number | null }
  >();
  if (qIds.length) {
    const { data: bankRows } = await supabase
      .from("questions")
      .select("id, correct_answer, explanation, marks")
      .in("id", qIds);
    for (const row of bankRows ?? []) {
      bankById.set(String((row as { id: string }).id), {
        correct_answer: (row as { correct_answer: string | null }).correct_answer,
        explanation: (row as { explanation: string | null }).explanation,
        marks: (row as { marks: number | null }).marks,
      });
    }
  }

  const questionsForScore = input.questions.map((q) => {
    const bank = bankById.get(q.id);
    const correctAnswer = bank?.correct_answer ?? q.correct_answer;
    const originalOpts = decodeOptionsFromExplanation(bank?.explanation);
    const originals = originalOpts.length
      ? originalOpts
      : q.originalOptions?.length
        ? q.originalOptions
        : [];
    const correctOptionText =
      q.correctOptionText ||
      (originals.length ? resolveCorrectOptionText(correctAnswer, originals) : null) ||
      resolveCorrectOptionText(correctAnswer, q.options) ||
      null;
    return {
      id: q.id,
      marks: Number(bank?.marks ?? q.marks) || 1,
      correct_answer: correctAnswer,
      correctOptionText,
      options: q.options,
      originalOptions: originals.length ? originals : undefined,
    };
  });

  const scored = scoreObjectiveAnswers(questionsForScore, input.answers);

  const status = input.terminated ? "terminated" : "submitted";
  const secStatus = input.terminated || input.faceWarned ? "flagged" : "pending";

  const vis = String(input.resultVisibility || "after_officer_release")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const immediateAliases = new Set([
    "immediate",
    "immediately",
    "immediately_after_submit",
    "release_immediately",
    "release_immediately_after_exam",
    "after_submit",
  ]);
  const publishNow =
    immediateAliases.has(vis) && !input.terminated && secStatus !== "flagged";
  const resultStatus = publishNow ? "published" : "pending";
  const releasedAt = publishNow ? new Date().toISOString() : null;

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
    if (attErr) console.warn("exam_attempts update", attErr);
  }

  const payload = {
    exam_id: input.examId,
    student_id: input.studentId,
    school_id: input.schoolId,
    attempt_id: input.attemptId,
    total_score: scored.totalScore,
    max_score: scored.maxMarks,
    objective_score: scored.totalScore,
    percentage: scored.percentage,
    grade: scored.grade,
    pass_fail: scored.passFail,
    correct_count: scored.correct,
    wrong_count: scored.wrong,
    unanswered_count: scored.unanswered,
    status: resultStatus,
    security_review_status: secStatus,
    released_at: releasedAt,
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
          objective_score: scored.totalScore,
          percentage: scored.percentage,
          grade: scored.grade,
          pass_fail: scored.passFail,
          correct_count: scored.correct,
          wrong_count: scored.wrong,
          unanswered_count: scored.unanswered,
          status: resultStatus,
          security_review_status: secStatus,
          released_at: releasedAt,
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
    published: publishNow,
  };
}
