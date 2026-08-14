/** Shared MCQ / True-False option encoding for D4EXAM. */

export type QuestionOption = {
  key: string;
  text: string;
  is_correct?: boolean;
};

/** Decode options from jsonb column OR legacy OPTIONS:: in explanation. */
export function parseQuestionOptions(input: {
  options?: unknown;
  explanation?: string | null;
  correct_answer?: string | null;
}): QuestionOption[] {
  const fromJson = normalizeJsonOptions(input.options);
  if (fromJson.length) return fromJson;

  const fromLegacy = decodeOptionsFromExplanation(input.explanation ?? null);
  if (fromLegacy.length) {
    const correct = (input.correct_answer || "").trim().toUpperCase();
    return fromLegacy.map((o) => ({
      ...o,
      is_correct: o.key === correct,
    }));
  }
  return [];
}

function normalizeJsonOptions(raw: unknown): QuestionOption[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      return normalizeJsonOptions(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: QuestionOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = String(o.key ?? o.option_key ?? "").trim().toUpperCase();
    const text = String(o.text ?? o.option_text ?? "").trim();
    if (!key || !text) continue;
    out.push({
      key,
      text,
      is_correct: Boolean(o.is_correct),
    });
  }
  return out;
}

export function decodeOptionsFromExplanation(explanation: string | null): QuestionOption[] {
  if (!explanation) return [];
  const line = explanation.split("\n").find((l) => l.startsWith("OPTIONS::"));
  if (!line) return [];
  const body = line.slice("OPTIONS::".length);
  const out: QuestionOption[] = [];
  for (const part of body.split("|")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    const text = part.slice(eq + 1).trim();
    if (key && text) out.push({ key, text });
  }
  return out;
}

/** Strip OPTIONS:: lines so explanation is human notes only. */
export function stripOptionsFromExplanation(explanation: string | null): string {
  if (!explanation) return "";
  return explanation
    .split("\n")
    .filter((l) => !l.startsWith("OPTIONS::"))
    .join("\n")
    .trim();
}

export function buildOptionsPayload(
  a: string,
  b: string,
  c: string,
  d: string,
  correct: string,
): QuestionOption[] {
  const correctKey = correct.trim().toUpperCase();
  const pairs: [string, string][] = [
    ["A", a],
    ["B", b],
    ["C", c],
    ["D", d],
  ];
  return pairs
    .filter(([, t]) => t.trim())
    .map(([key, text]) => ({
      key,
      text: text.trim(),
      is_correct: key === correctKey,
    }));
}

/** Legacy string still written for backward-compat during transition. */
export function encodeOptionsLegacy(opts: QuestionOption[]): string {
  if (!opts.length) return "";
  return `OPTIONS::${opts.map((o) => `${o.key}=${o.text}`).join("|")}`;
}

export function optionsToFormFields(opts: QuestionOption[]): {
  a: string;
  b: string;
  c: string;
  d: string;
} {
  const map: Record<string, string> = { A: "", B: "", C: "", D: "" };
  for (const o of opts) {
    if (o.key in map) map[o.key] = o.text;
  }
  return { a: map.A, b: map.B, c: map.C, d: map.D };
}

export function scoreObjectiveAnswers(
  questions: {
    id: string;
    question_type: string;
    marks: number;
    correct_answer: string | null;
    options?: QuestionOption[];
  }[],
  answers: Record<string, string>,
): {
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  passFail: string;
  correct: number;
  wrong: number;
  unanswered: number;
} {
  let totalScore = 0;
  let maxScore = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  for (const q of questions) {
    const type = (q.question_type || "").toLowerCase();
    const isObjective = type === "mcq" || type === "true_false" || type === "true/false";
    maxScore += q.marks || 0;
    if (!isObjective) continue;

    const ans = (answers[q.id] || "").trim();
    if (!ans) {
      unanswered += 1;
      continue;
    }
    const expected = (q.correct_answer || "").trim().toUpperCase();
    const given = ans.toUpperCase();
    // Accept key (A/B/C/D) or full option text
    let match = expected && given === expected;
    if (!match && q.options?.length) {
      const correctOpt = q.options.find((o) => o.is_correct || o.key === expected);
      if (correctOpt) {
        match =
          given === correctOpt.key ||
          given === correctOpt.text.trim().toUpperCase();
      }
    }
    if (match) {
      correct += 1;
      totalScore += q.marks || 0;
    } else {
      wrong += 1;
    }
  }

  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0;
  const grade =
    percentage >= 70 ? "A" : percentage >= 60 ? "B" : percentage >= 50 ? "C" : percentage >= 40 ? "D" : "F";
  const passFail = percentage >= 40 ? "pass" : "fail";

  return { totalScore, maxScore, percentage, grade, passFail, correct, wrong, unanswered };
}
