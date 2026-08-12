/** Embedded exam metadata (questions to answer, etc.) stored in description. */

const META_MARKER = "[[D4_EXAM_META]]";

export type ExamMeta = {
  questionsToAnswer: number | null;
};

export function embedExamMeta(
  description: string | null | undefined,
  meta: ExamMeta,
): string {
  const without = (description || "")
    .replace(new RegExp(`\n?${META_MARKER.replace(/[[\]]/g, "\\$&")}[\s\S]*?(?=\n\[\[|$)`), "")
    .trim();
  // Keep only our meta line; security marker handled separately
  const cleaned = without
    .split("\n")
    .filter((line) => !line.startsWith(META_MARKER))
    .join("\n")
    .trim();
  const blob = `${META_MARKER}${JSON.stringify(meta)}`;
  return cleaned ? `${cleaned}\n${blob}` : blob;
}

export function parseExamMeta(description: string | null | undefined): ExamMeta {
  if (!description) return { questionsToAnswer: null };
  const idx = description.indexOf(META_MARKER);
  if (idx < 0) return { questionsToAnswer: null };
  try {
    // Meta may sit before security marker
    let raw = description.slice(idx + META_MARKER.length).trim();
    const next = raw.indexOf("[[");
    if (next >= 0) raw = raw.slice(0, next).trim();
    const parsed = JSON.parse(raw) as Partial<ExamMeta>;
    const n =
      typeof parsed.questionsToAnswer === "number" && parsed.questionsToAnswer > 0
        ? Math.floor(parsed.questionsToAnswer)
        : null;
    return { questionsToAnswer: n };
  } catch {
    return { questionsToAnswer: null };
  }
}

/** Deterministic shuffle so each student gets a stable personal paper. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const next = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick up to `count` questions; random order when randomize is on. */
export function pickExamQuestions<T extends { id: string }>(
  bank: T[],
  options: {
    questionsToAnswer: number | null;
    randomize: boolean;
    studentKey: string;
    examId: string;
  },
): T[] {
  if (!bank.length) return [];
  const limit =
    options.questionsToAnswer && options.questionsToAnswer > 0
      ? Math.min(options.questionsToAnswer, bank.length)
      : bank.length;

  if (options.randomize) {
    const shuffled = seededShuffle(bank, `${options.examId}:${options.studentKey}`);
    return shuffled.slice(0, limit);
  }
  // Sequential take (first N of bank order)
  return bank.slice(0, limit);
}
