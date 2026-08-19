/**
 * Load & prepare CBT questions for a student paper.
 * Tries exam_questions first (two-step, RLS-safe), then course bank.
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

type RawQ = {
  id: string;
  question_text: string;
  question_type: string | null;
  marks: number | null;
  correct_answer: string | null;
  explanation: string | null;
  options?: unknown;
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

/** Two-step load: exam_questions ids first, then questions by id (avoids nested RLS failures). */
async function loadFromExamQuestions(examId: string): Promise<RawQ[]> {
  try {
    const linkRes = await supabase
      .from("exam_questions")
      .select("question_id, marks, question_order")
      .eq("exam_id", examId)
      .order("question_order", { ascending: true })
      .limit(300);

    if (linkRes.error) {
      console.warn("[cbt] exam_questions link", linkRes.error.message);
      const nested = await supabase
        .from("exam_questions")
        .select(
          "question_id, marks, question_order, questions(id, question_text, question_type, marks, correct_answer, explanation, options, status)",
        )
        .eq("exam_id", examId)
        .order("question_order", { ascending: true })
        .limit(300);
      if (nested.error || !nested.data?.length) {
        const nested2 = await supabase
          .from("exam_questions")
          .select(
            "question_id, marks, question_order, questions(id, question_text, question_type, marks, correct_answer, explanation, status)",
          )
          .eq("exam_id", examId)
          .order("question_order", { ascending: true })
          .limit(300);
        if (nested2.error || !nested2.data?.length) return [];
        return mapExamQuestionRows(nested2.data as never);
      }
      return mapExamQuestionRows(nested.data as never);
    }

    const links = (linkRes.data ?? []).filter((r) => r.question_id);
    if (!links.length) return [];

    const ids = links.map((r) => String(r.question_id));
    const marksById = new Map(links.map((r) => [String(r.question_id), r.marks]));
    const orderById = new Map(links.map((r, i) => [String(r.question_id), r.question_order ?? i]));

    const qRows = await fetchQuestionsByIds(ids);
    if (!qRows.length) return [];

    qRows.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
    return qRows.map((q) => ({
      ...q,
      marks: marksById.get(q.id) ?? q.marks ?? 1,
    }));
  } catch (e) {
    console.warn("[cbt] exam_questions exception", e);
    return [];
  }
}

async function fetchQuestionsByIds(ids: string[]): Promise<RawQ[]> {
  if (!ids.length) return [];
  const selectFull =
    "id, question_text, question_type, marks, correct_answer, explanation, options, status";
  const selectSlim =
    "id, question_text, question_type, marks, correct_answer, explanation, status";

  for (const cols of [selectFull, selectSlim]) {
    const { data, error } = await supabase.from("questions").select(cols).in("id", ids).limit(300);
    if (!error && data?.length) return data as never;
    if (error) console.warn("[cbt] questions by id", error.message);
  }
  return [];
}

function mapExamQuestionRows(
  rows: {
    marks?: number | null;
    questions?: RawQ | RawQ[] | null;
  }[],
): RawQ[] {
  const out: RawQ[] = [];
  for (const row of rows) {
    const q = Array.isArray(row.questions) ? row.questions[0] : row.questions;
    if (!q?.id) continue;
    out.push({
      id: String(q.id),
      question_text: String(q.question_text || ""),
      question_type: q.question_type ?? null,
      marks: row.marks ?? q.marks ?? 1,
      correct_answer: q.correct_answer ?? null,
      explanation: q.explanation ?? null,
      options: (q as { options?: unknown }).options,
    });
  }
  return out;
}

export async function loadExamQuestionBank(opts: {
  courseId: string;
  schoolId?: string | null;
  examId?: string | null;
}): Promise<RawQ[]> {
  const courseId = opts.courseId ? String(opts.courseId) : "";
  const schoolId = opts.schoolId ? String(opts.schoolId) : null;
  const examId = opts.examId ? String(opts.examId) : null;

  if (examId) {
    const linked = await loadFromExamQuestions(examId);
    if (linked.length) return linked;
  }

  if (!courseId) return [];

  const selectFull =
    "id, question_text, question_type, marks, correct_answer, explanation, options, school_id, status, course_id";
  const selectSlim =
    "id, question_text, question_type, marks, correct_answer, explanation, school_id, status, course_id";

  const run = async (
    cols: string,
    withSchool: boolean,
    statuses: string[] | null,
  ): Promise<RawQ[]> => {
    let q = supabase
      .from("questions")
      .select(cols)
      .eq("course_id", courseId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (statuses?.length) q = q.in("status", statuses);
    if (withSchool && schoolId) q = q.eq("school_id", schoolId);
    const { data, error } = await q;
    if (error) {
      console.warn("[cbt] questions query", {
        withSchool,
        statuses,
        message: error.message,
      });
      return [];
    }
    return (data ?? []) as never;
  };

  const attempts: Array<() => Promise<RawQ[]>> = [
    () => run(selectFull, true, ["active", "approved"]),
    () => run(selectFull, false, ["active", "approved"]),
    () => run(selectFull, true, ["active", "approved", "pending"]),
    () => run(selectFull, false, ["active", "approved", "pending"]),
    () => run(selectFull, true, null),
    () => run(selectFull, false, null),
    () => run(selectSlim, true, ["active", "approved"]),
    () => run(selectSlim, false, ["active", "approved"]),
    () => run(selectSlim, true, null),
    () => run(selectSlim, false, null),
  ];

  for (const attempt of attempts) {
    const rows = await attempt();
    if (rows.length) return rows;
  }
  return [];
}

/** Attach all active course-bank questions to an exam if none linked yet. */
export async function ensureExamQuestionsLinked(opts: {
  examId: string;
  courseId: string;
  schoolId: string;
  maxQuestions?: number | null;
}): Promise<number> {
  const { examId, courseId, schoolId } = opts;
  if (!examId || !courseId) return 0;

  const existing = await supabase
    .from("exam_questions")
    .select("question_id")
    .eq("exam_id", examId)
    .limit(1);
  if (!existing.error && (existing.data?.length ?? 0) > 0) return 0;

  let qs: { id: string; marks: number | null }[] | null = null;
  for (const statuses of [["active", "approved"], ["active", "approved", "pending"], null] as (string[] | null)[]) {
    let q = supabase
      .from("questions")
      .select("id, marks")
      .eq("course_id", courseId)
      .eq("school_id", schoolId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (statuses) q = q.in("status", statuses);
    const res = await q;
    if (!res.error && res.data?.length) {
      qs = res.data as never;
      break;
    }
  }
  if (!qs?.length) return 0;

  const limit = opts.maxQuestions && opts.maxQuestions > 0 ? opts.maxQuestions : qs.length;
  const picked = qs.slice(0, Math.min(limit, qs.length));
  const rows = picked.map((q, i) => ({
    exam_id: examId,
    question_id: q.id,
    marks: q.marks ?? 1,
    question_order: i + 1,
  }));
  const { error } = await supabase.from("exam_questions").insert(rows as never);
  if (error) {
    console.warn("[cbt] ensureExamQuestionsLinked", error.message);
    return 0;
  }
  return rows.length;
}

export function prepareStudentPaper(
  bankRows: RawQ[],
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
      let optionTexts = parsed.map((o) => o.text).filter(Boolean);
      if (!optionTexts.length) optionTexts = decodeOptionsLegacy(q.explanation ?? null);
      if (!optionTexts.length && String(q.question_type || "").toLowerCase().includes("true")) {
        optionTexts = ["True", "False"];
      }
      if (!optionTexts.length && q.question_text) {
        optionTexts = ["Option A", "Option B", "Option C", "Option D"];
      }
      const originalOptions = [...optionTexts];
      const correctOptionText = resolveCorrectOptionText(q.correct_answer, originalOptions);
      return {
        id: String(q.id),
        question_text: String(q.question_text || ""),
        marks: Number(q.marks) || 1,
        correct_answer: q.correct_answer,
        options: optionTexts,
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
