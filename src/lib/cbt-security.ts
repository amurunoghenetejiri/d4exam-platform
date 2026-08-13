import { supabase } from "@/integrations/supabase/client";

export type SecurityEventType =
  | "TAB_SWITCH"
  | "FULLSCREEN_EXIT"
  | "COPY_ATTEMPT"
  | "CUT_ATTEMPT"
  | "PASTE_ATTEMPT"
  | "CONTEXT_MENU"
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "ONE_FACE"
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_PERMISSION_GRANTED"
  | "MIC_PERMISSION_DENIED"
  | "MIC_PERMISSION_GRANTED"
  | "CONNECTION_LOST"
  | "CONNECTION_RESTORED"
  | "WARNING_SHOWN"
  | "AUTO_SUBMIT"
  | "MANUAL_SUBMIT"
  | "SECURITY_CHECK_PASSED"
  | "SECURITY_CHECK_FAILED";

export async function logSecurityEvent(input: {
  schoolId: string;
  examId: string;
  attemptId: string | null;
  studentId: string;
  eventType: SecurityEventType | string;
  severity?: "low" | "medium" | "high";
  description?: string;
  questionId?: string | null;
  questionIndex?: number | null;
  extra?: Record<string, unknown>;
}) {
  try {
    await supabase.from("integrity_events").insert({
      school_id: input.schoolId,
      exam_id: input.examId,
      attempt_id: input.attemptId,
      student_id: input.studentId,
      event_type: input.eventType,
      severity: input.severity ?? "low",
      description: input.description ?? null,
      metadata: {
        question_id: input.questionId ?? null,
        question_index: input.questionIndex ?? null,
        at: new Date().toISOString(),
        ...(input.extra ?? {}),
      } as never,
    } as never);
  } catch (e) {
    console.warn("logSecurityEvent failed", e);
  }
}

/** Simple letter grade from percentage */
export function gradeFromPercentage(pct: number): string {
  if (pct >= 70) return "A";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 45) return "D";
  if (pct >= 40) return "E";
  return "F";
}

function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

/**
 * Score objective answers.
 * Prefer `correctOptionText` (resolved before option shuffle) so letter answers
 * still match after randomize_options. Falls back to letter index only when
 * options were not shuffled / text is unavailable.
 */
export function scoreObjectiveAnswers(
  questions: {
    id: string;
    correct_answer: string | null;
    /** Canonical correct option text (preferred when options may be shuffled) */
    correctOptionText?: string | null;
    marks: number;
    options: string[];
  }[],
  answers: Record<string, number>,
) {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  let totalScore = 0;
  let maxMarks = 0;

  for (const q of questions) {
    const marks = Number(q.marks) || 1;
    maxMarks += marks;
    const idx = answers[q.id];
    if (idx == null || Number.isNaN(Number(idx))) {
      unanswered += 1;
      continue;
    }
    const chosen = normalizeAnswer(String(q.options[idx] ?? ""));
    if (!chosen) {
      unanswered += 1;
      continue;
    }

    const textKey = (q.correctOptionText || "").trim();
    const raw = (q.correct_answer || "").trim();
    let ok = false;

    if (textKey) {
      // Primary path: match by option content (works after shuffle)
      ok = chosen === normalizeAnswer(textKey);
    } else if (/^[A-Da-d]$/.test(raw)) {
      // Letter stored in DB — only valid if options kept original order
      const letterIdx = raw.toUpperCase().charCodeAt(0) - 65;
      ok = idx === letterIdx;
      // Also accept if the chosen text equals that letter (rare)
      if (!ok) ok = chosen === raw.toLowerCase();
    } else if (raw) {
      ok =
        chosen === normalizeAnswer(raw) ||
        String(idx) === raw ||
        // allow "A. answer" style storage
        chosen === normalizeAnswer(raw.replace(/^[A-Da-d][).:\-\s]+/, ""));
    }

    if (ok) {
      correct += 1;
      totalScore += marks;
    } else {
      wrong += 1;
    }
  }

  const percentage = maxMarks > 0 ? Math.round((totalScore / maxMarks) * 1000) / 10 : 0;
  return {
    correct,
    wrong,
    unanswered,
    totalScore,
    maxMarks,
    percentage,
    grade: gradeFromPercentage(percentage),
    passFail: percentage >= 40 ? "Pass" : "Fail",
  };
}
