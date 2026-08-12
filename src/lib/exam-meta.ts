/** Embedded exam metadata (questions to answer, etc.) stored in description. */

import { META_MARKER, stripInternalMarkers } from "@/lib/exam-security";

export type ExamMeta = {
  questionsToAnswer: number | null;
};

export function embedExamMeta(
  description: string | null | undefined,
  meta: ExamMeta,
): string {
  // Start from human text only (no security / meta markers)
  const cleaned = stripInternalMarkers(description);
  const blob = `${META_MARKER}${JSON.stringify(meta)}`;
  return cleaned ? `${cleaned}\n${blob}` : blob;
}

export function parseExamMeta(description: string | null | undefined): ExamMeta {
  if (!description) return { questionsToAnswer: null };
  const idx = description.indexOf(META_MARKER);
  if (idx < 0) return { questionsToAnswer: null };
  try {
    let raw = description.slice(idx + META_MARKER.length).trim();
    const start = raw.indexOf("{");
    if (start < 0) return { questionsToAnswer: null };
    let depth = 0;
    let end = -1;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      if (raw[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return { questionsToAnswer: null };
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ExamMeta>;
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
  return bank.slice(0, limit);
}
