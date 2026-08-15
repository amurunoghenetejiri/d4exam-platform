import type { ExamSecuritySettings, ScreenShareMode } from "@/types";

export const DEFAULT_EXAM_SECURITY: ExamSecuritySettings = {
  fullscreen: true,
  tabMonitoring: true,
  maxTabSwitches: 5,
  blockCopyPaste: true,
  randomizeQuestions: true,
  randomizeOptions: true,
  // Camera on by default so face monitoring works in CBT
  requireCamera: true,
  requireMicrophone: false,
  requireScreenShare: false,
  screenShareMode: "disabled",
  faceDetection: true,
  maxFaceWarnings: 5,
  faceViolationAction: "flag",
  thresholdAction: "flag",
  resultVisibility: "after_officer_release",
  questionsToAnswer: null,
};

export const SECURITY_MARKER = "[[D4_SECURITY_JSON]]";
export const META_MARKER = "[[D4_EXAM_META]]";

const storageKey = (teacherId: string) => `d4exam.teacher.security.${teacherId}`;

/** Resolve screen-share policy from new or legacy fields */
export function resolveScreenShareMode(s: Partial<ExamSecuritySettings> | null | undefined): ScreenShareMode {
  if (!s) return "disabled";
  if (s.screenShareMode === "optional" || s.screenShareMode === "required" || s.screenShareMode === "disabled") {
    return s.screenShareMode;
  }
  if (s.requireScreenShare === true) return "required";
  return "disabled";
}

export function normalizeSecuritySettings(
  partial: Partial<ExamSecuritySettings> | null | undefined,
): ExamSecuritySettings {
  const merged = { ...DEFAULT_EXAM_SECURITY, ...(partial ?? {}) };
  const mode = resolveScreenShareMode(merged);
  merged.screenShareMode = mode;
  merged.requireScreenShare = mode === "required";
  // Face detection requires a live camera
  if (merged.faceDetection) merged.requireCamera = true;
  return merged;
}

export function loadTeacherSecurityDefaults(teacherId: string): ExamSecuritySettings {
  if (typeof window === "undefined" || !teacherId) return { ...DEFAULT_EXAM_SECURITY };
  try {
    const raw = localStorage.getItem(storageKey(teacherId));
    if (!raw) return { ...DEFAULT_EXAM_SECURITY };
    const parsed = JSON.parse(raw) as Partial<ExamSecuritySettings>;
    return normalizeSecuritySettings(parsed);
  } catch {
    return { ...DEFAULT_EXAM_SECURITY };
  }
}

export function saveTeacherSecurityDefaults(teacherId: string, settings: ExamSecuritySettings) {
  if (typeof window === "undefined" || !teacherId) return;
  localStorage.setItem(storageKey(teacherId), JSON.stringify(normalizeSecuritySettings(settings)));
}

export function toExamSettingsRow(
  examId: string,
  s: ExamSecuritySettings,
  totalMarks = 0,
  questionsToAnswer: number | null = null,
) {
  const n = normalizeSecuritySettings(s);
  return {
    exam_id: examId,
    fullscreen: n.fullscreen,
    tab_monitoring: n.tabMonitoring,
    max_tab_switches: n.maxTabSwitches,
    block_copy_paste: n.blockCopyPaste,
    randomize_questions: n.randomizeQuestions,
    randomize_options: n.randomizeOptions,
    require_camera: n.requireCamera,
    require_microphone: n.requireMicrophone,
    require_screen_share: n.requireScreenShare,
    screen_share_mode: n.screenShareMode,
    face_detection: n.faceDetection,
    max_face_warnings: n.maxFaceWarnings,
    face_violation_action: n.faceViolationAction,
    threshold_action: n.thresholdAction,
    result_visibility: n.resultVisibility,
    total_marks: totalMarks,
    questions_to_answer: questionsToAnswer ?? n.questionsToAnswer,
  };
}

export type ExamSettingsRow = {
  exam_id: string;
  fullscreen?: boolean | null;
  tab_monitoring?: boolean | null;
  max_tab_switches?: number | null;
  block_copy_paste?: boolean | null;
  randomize_questions?: boolean | null;
  randomize_options?: boolean | null;
  require_camera?: boolean | null;
  require_microphone?: boolean | null;
  require_screen_share?: boolean | null;
  screen_share_mode?: string | null;
  face_detection?: boolean | null;
  max_face_warnings?: number | null;
  face_violation_action?: string | null;
  threshold_action?: string | null;
  result_visibility?: string | null;
  total_marks?: number | null;
  instructions?: string | null;
  questions_to_answer?: number | null;
};

export function fromExamSettingsRow(
  row: ExamSettingsRow | null | undefined,
  description?: string | null,
): ExamSecuritySettings {
  if (row) {
    return normalizeSecuritySettings({
      fullscreen: row.fullscreen ?? undefined,
      tabMonitoring: row.tab_monitoring ?? undefined,
      maxTabSwitches: row.max_tab_switches ?? undefined,
      blockCopyPaste: row.block_copy_paste ?? undefined,
      randomizeQuestions: row.randomize_questions ?? undefined,
      randomizeOptions: row.randomize_options ?? undefined,
      requireCamera: row.require_camera ?? undefined,
      requireMicrophone: row.require_microphone ?? undefined,
      requireScreenShare: row.require_screen_share ?? undefined,
      screenShareMode: (row.screen_share_mode as ScreenShareMode) ?? undefined,
      faceDetection: row.face_detection ?? undefined,
      maxFaceWarnings: row.max_face_warnings ?? undefined,
      faceViolationAction: row.face_violation_action as ExamSecuritySettings["faceViolationAction"],
      thresholdAction: row.threshold_action as ExamSecuritySettings["thresholdAction"],
      resultVisibility: row.result_visibility as ExamSecuritySettings["resultVisibility"],
      questionsToAnswer: row.questions_to_answer ?? undefined,
    });
  }

  if (description && description.includes(SECURITY_MARKER)) {
    try {
      const raw = description.split(SECURITY_MARKER)[1]?.split(META_MARKER)[0] ?? "";
      const parsed = JSON.parse(raw.trim()) as Partial<ExamSecuritySettings>;
      return normalizeSecuritySettings(parsed);
    } catch {
      /* fall through */
    }
  }

  return { ...DEFAULT_EXAM_SECURITY };
}
