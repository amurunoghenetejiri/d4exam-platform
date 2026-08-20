/**
 * Load & prepare CBT questions for a student paper.
 * Priority: RPC (bypasses RLS) → exam_questions → course bank.
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

function normalizeRows(data: unknown): RawQ[] {
  if (!Array.isArray(data)) return [];
  const out: RawQ[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = r.id != null ? String(r.id) : "";
    const text = r.question_text != null ? String(r.question_text) : "";
    if (!id) continue;
    out.push({
      id,
      question_text: text,
      question_type: r.question_type != null ? String(r.question_type) : null,
      marks: r.marks != null ? Number(r.marks) : 1,
      correct_answer: r.correct_answer != null ? String(r.correct_answer) : null,
      explanation: r.explanation != null ? String(r.explanation) : null,
      options: r.options,
    });
  }
  return out;
}

async function loadViaRpc(examId: string, courseId: string | null, schoolId: string | null): Promise<RawQ[]> {
  try {
    const { data, error } = await supabase.rpc("get_cbt_exam_questions", {
      p_exam_id: examId,
      p_course_id: courseId || null,
      p_school_id: schoolId || null,
    });
    if (error) {
      console.warn("[cbt] get_cbt_exam_questions rpc", error.message);
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    return normalizeRows(rows);
  } catch (e) {
    console.warn("[cbt] rpc exception", e);
    return [];
  }
}

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
      return [];
    }
    const links = (linkRes.data ?? []).filter((r) => r.question_id);
    if (!links.length) return [];
    const ids = links.map((r) => String(r.question_id));
    const marksById = new Map(links.map((r) => [String(r.question_id), r.marks]));
    const orderById = new Map(links.map((r, i) => [String(r.question_id), r.question_order ?? i]));
    const qRows = await fetchQuestionsByIds(ids);
    if (!qRows.length) return [];
    qRows.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
    return qRows.map((q) => ({ ...q, marks: marksById.get(q.id) ?? q.marks ?? 1 }));
  } catch (e) {
    console.warn("[cbt] exam_questions exception", e);
    return [];
  }
}

async function fetchQuestionsByIds(ids: string[]): Promise<RawQ[]> {
  if (!ids.length) return [];
  for (const cols of [
    "id, question_text, question_type, marks, correct_answer, explanation, options, status",
    "id, question_text, question_type, marks, correct_answer, explanation, status",
    "id, question_text, question_type, marks, correct_answer, status",
    "id, question_text, marks, correct_answer",
  ]) {
    const { data, error } = await supabase.from("questions").select(cols).in("id", ids).limit(300);
    if (!error && data?.length) return normalizeRows(data);
    if (error) console.warn("[cbt] questions by id", error.message);
  }
  return [];
}

async function loadFromCourseBank(courseId: string, schoolId: string | null): Promise<RawQ[]> {
  if (!courseId) return [];
  const colSets = [
    "id, question_text, question_type, marks, correct_answer, explanation, options, school_id, status, course_id",
    "id, question_text, question_type, marks, correct_answer, explanation, school_id, status, course_id",
    "id, question_text, question_type, marks, correct_answer, school_id, status, course_id",
    "id, question_text, marks, correct_answer, course_id",
  ];
  for (const cols of colSets) {
    for (const withSchool of [true, false]) {
      for (const statuses of [["active", "approved"], ["active", "approved", "pending"], null] as (string[] | null)[]) {
        let q = supabase.from("questions").select(cols).eq("course_id", courseId).limit(300);
        if (statuses) q = q.in("status", statuses);
        if (withSchool && schoolId) q = q.eq("school_id", schoolId);
        const { data, error } = await q;
        if (error) {
          console.warn("[cbt] course bank", error.message);
          continue;
        }
        const rows = normalizeRows(data);
        if (rows.length) return rows;
      }
    }
  }
  return [];
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
    const viaRpc = await loadViaRpc(examId, courseId || null, schoolId);
    if (viaRpc.length) return viaRpc;
  }
  if (examId) {
    const linked = await loadFromExamQuestions(examId);
    if (linked.length) return linked;
  }
  if (courseId) {
    const bank = await loadFromCourseBank(courseId, schoolId);
    if (bank.length) return bank;
  }
  return [];
}

export async function ensureExamQuestionsLinked(opts: {
  examId: string;
  courseId: string;
  schoolId: string;
  maxQuestions?: number | null;
}): Promise<number> {
  const { examId, courseId, schoolId } = opts;
  if (!examId || !courseId) return 0;
  const existing = await supabase.from("exam_questions").select("question_id").eq("exam_id", examId).limit(1);
  if (!existing.error && (existing.data?.length ?? 0) > 0) return 0;
  let qs: { id: string; marks: number | null }[] | null = null;
  for (const statuses of [["active", "approved"], ["active", "approved", "pending"], null] as (string[] | null)[]) {
    let q = supabase.from("questions").select("id, marks").eq("course_id", courseId).eq("school_id", schoolId).order("created_at", { ascending: true }).limit(300);
    if (statuses) q = q.in("status", statuses);
    const res = await q;
    if (!res.error && res.data?.length) {
      qs = res.data as never;
      break;
    }
  }
  if (!qs?.length) {
    const res = await supabase.from("questions").select("id, marks").eq("course_id", courseId).limit(300);
    if (!res.error && res.data?.length) qs = res.data as never;
  }
  if (!qs?.length) return 0;
  const limit = opts.maxQuestions && opts.maxQuestions > 0 ? opts.maxQuestions : qs.length;
  const picked = qs.slice(0, Math.min(limit, qs.length));
  const rows = picked.map((q, i) => ({ exam_id: examId, question_id: q.id, marks: q.marks ?? 1, question_order: i + 1 }));
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
      const text = String(q.question_text || "").trim() || "Question";
      return {
        id: String(q.id),
        question_text: text,
        marks: Number(q.marks) || 1,
        correct_answer: q.correct_answer,
        options: optionTexts,
        originalOptions,
        correctOptionText,
      };
    })
    .filter((q) => q.id);

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
