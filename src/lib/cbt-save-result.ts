import { supabase } from "@/integrations/supabase/client";
import { scoreObjectiveAnswers, resolveCorrectOptionText } from "@/lib/cbt-security";
import { friendlyError } from "@/lib/friendly-error";
import { notifyOfficersStudentResultPending } from "@/lib/notify";
import type { ResultVisibility } from "@/types";

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

function decodeOptionsFromJson(options: unknown): string[] {
  if (!options) return [];
  let arr: unknown = options;
  if (typeof options === "string") {
    try {
      arr = JSON.parse(options);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const byKey: Record<string, string> = {};
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = String(o.key ?? o.option_key ?? "").trim().toUpperCase();
    const text = String(o.text ?? o.option_text ?? "").trim();
    if (key && text) byKey[key] = text;
  }
  return ["A", "B", "C", "D", "E", "F"].map((k) => byKey[k]).filter(Boolean) as string[];
}

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
    { correct_answer: string | null; options?: unknown; explanation: string | null; marks: number | null }
  >();
  if (qIds.length) {
    const { data: bankRows } = await supabase
      .from("questions")
      .select("id, correct_answer, options, marks, explanation")
      .in("id", qIds);
    for (const row of bankRows ?? []) {
      bankById.set(String((row as { id: string }).id), {
        correct_answer: (row as { correct_answer: string | null }).correct_answer,
        options: (row as { options?: unknown }).options,
        explanation: (row as { explanation?: string | null }).explanation ?? null,
        marks: (row as { marks: number | null }).marks,
      });
    }
  }

  const questionsForScore = input.questions.map((q) => {
    const bank = bankById.get(q.id);
    const correctAnswer = bank?.correct_answer ?? q.correct_answer;
    const originalOpts = (() => {
      const fromJson = decodeOptionsFromJson(bank?.options);
      if (fromJson.length) return fromJson;
      return decodeOptionsFromExplanation(bank?.explanation);
    })();
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

  const submittedAt = new Date().toISOString();
  const attemptPatch = {
    status,
    submitted_at: submittedAt,
    updated_at: submittedAt,
    score: scored.totalScore,
    max_score: scored.maxMarks,
    answers: input.answers,
  } as never;

  if (input.attemptId) {
    const { error: attErr } = await supabase
      .from("exam_attempts")
      .update(attemptPatch)
      .eq("id", input.attemptId);
    if (attErr) {
      console.warn("exam_attempts update by id", attErr);
      await supabase
        .from("exam_attempts")
        .update(attemptPatch)
        .eq("exam_id", input.examId)
        .eq("student_id", input.studentId)
        .eq("status", "in_progress");
    }
  } else {
    await supabase
      .from("exam_attempts")
      .update(attemptPatch)
      .eq("exam_id", input.examId)
      .eq("student_id", input.studentId)
      .eq("status", "in_progress");
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

  if (!error && input.schoolId && !publishNow) {
    void notifyOfficersStudentResultPending({
      schoolId: input.schoolId,
      examId: input.examId,
      studentId: input.studentId,
      resultId: resultId ?? null,
      published: false,
    });
  }

  if (!error && input.schoolId) {
    try {
      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("id, status")
        .eq("exam_id", input.examId)
        .eq("school_id", input.schoolId);
      const list = attempts ?? [];
      if (list.length > 0) {
        const done = list.filter((a) =>
          ["submitted", "completed", "finished", "graded", "marked", "terminated", "flagged"].includes(
            String((a as { status: string }).status || "").toLowerCase(),
          ),
        );
        if (done.length === list.length) {
          await supabase
            .from("examinations")
            .update({ status: "completed" } as never)
            .eq("id", input.examId)
            .eq("school_id", input.schoolId)
            .neq("status", "completed");
        }
      }
    } catch (e) {
      console.warn("auto-complete exam", e);
    }
  }

  return {
    scored,
    error: error ? { message: friendlyError(error, "Could not save your result. Please try again.") } : null,
    resultId,
    status,
    published: publishNow,
  };
}
