/**
 * Load & prepare CBT questions for a student paper.
 * Robust against school_id / status mismatches and option storage shapes.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseQuestionOptions } from "@/lib/question-options";
import { resolveCorrectOptionText } from "@/lib/cbt-security";
import { pickExamQuestions, seededShuffle } from "@/lib/exam-meta";

export type CbtQuestionRow = {
  id: string;
  question_text: string;
  marks: number;
  correct_answer: string | null;
  options: string[];
  originalOptions: string[];
  correctOptionText: string | null;
};

function decodeOptionsLegacy(explanation: string | null): string[] {
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

export async function loadExamQuestionBank(opts: {
  courseId: string;
  schoolId?: string | null;
}): Promise<
  {
    id: string;
    question_text: string;
    question_type: string | null;
    marks: number | null;
    correct_answer: string | null;
    explanation: string | null;
    options?: unknown;
  }[]
> {
  const courseId = opts.courseId;
  const schoolId = opts.schoolId ? String(opts.schoolId) : null;
  const selectCols =
    "id, question_text, question_type, marks, correct_answer, explanation, options, school_id, status, course_id";

  const run = async (withSchool: boolean, statuses: string[] | null) => {
    let q = supabase
      .from("questions")
      .select(selectCols)
      .eq("course_id", courseId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (statuses?.length) q = q.in("status", statuses);
    if (withSchool && schoolId) q = q.eq("school_id", schoolId);
    const { data, error } = await q;
    if (error) {
      console.warn("[cbt] questions query", { withSchool, statuses, message: error.message });
      return [];
    }
    return data ?? [];
  };

  let rows = await run(true, ["active", "approved"]);
  if (!rows.length) rows = await run(false, ["active", "approved"]);
  if (!rows.length) rows = await run(true, ["active", "approved", "pending"]);
  if (!rows.length) rows = await run(false, ["active", "approved", "pending"]);
  if (!rows.length) rows = await run(true, null);
  if (!rows.length) rows = await run(false, null);
  return rows as never;
}

export function prepareStudentPaper(
  bankRows: {
    id: string;
    question_text: string;
    question_type?: string | null;
    marks?: number | null;
    correct_answer: string | null;
    explanation?: string | null;
    options?: unknown;
  }[],
  opts: {
    questionsToAnswer: number | null;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    studentKey: string;
    examId: string;
  },
): CbtQuestionRow[] {
  const bank: CbtQuestionRow[] = bankRows
    .map((q) => {
      const parsed = parseQuestionOptions({
        options: q.options,
        explanation: q.explanation ?? null,
        correct_answer: q.correct_answer,
      });
      let opts = parsed.map((o) => o.text).filter(Boolean);
      if (!opts.length) opts = decodeOptionsLegacy(q.explanation ?? null);
      if (!opts.length && String(q.question_type || "").toLowerCase().includes("true")) {
        opts = ["True", "False"];
      }
      const originalOptions = [...opts];
      const correctOptionText = resolveCorrectOptionText(q.correct_answer, originalOptions);
      return {
        id: String(q.id),
        question_text: String(q.question_text || ""),
        marks: Number(q.marks) || 1,
        correct_answer: q.correct_answer,
        options: opts,
        originalOptions,
        correctOptionText,
      };
    })
    .filter((q) => q.id && q.question_text);

  let picked = pickExamQuestions(bank as never, {
    questionsToAnswer: opts.questionsToAnswer,
    randomize: opts.randomizeQuestions,
    studentKey: opts.studentKey,
    examId: opts.examId,
  }) as CbtQuestionRow[];

  if (opts.randomizeOptions) {
    picked = picked.map((q) => ({
      ...q,
      options: seededShuffle(q.options, `${opts.examId}:${opts.studentKey}:${q.id}:opts`),
    }));
  }
  return picked;
}
