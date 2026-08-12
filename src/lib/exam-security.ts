import type { ExamSecuritySettings } from "@/types";

export const DEFAULT_EXAM_SECURITY: ExamSecuritySettings = {
  fullscreen: true,
  tabMonitoring: true,
  maxTabSwitches: 5,
  blockCopyPaste: true,
  randomizeQuestions: true,
  randomizeOptions: true,
  requireCamera: false,
  requireMicrophone: false,
  thresholdAction: "flag",
};

const storageKey = (teacherId: string) => `d4exam.teacher.security.${teacherId}`;

export function loadTeacherSecurityDefaults(teacherId: string): ExamSecuritySettings {
  if (typeof window === "undefined" || !teacherId) return { ...DEFAULT_EXAM_SECURITY };
  try {
    const raw = localStorage.getItem(storageKey(teacherId));
    if (!raw) return { ...DEFAULT_EXAM_SECURITY };
    const parsed = JSON.parse(raw) as Partial<ExamSecuritySettings>;
    return { ...DEFAULT_EXAM_SECURITY, ...parsed };
  } catch {
    return { ...DEFAULT_EXAM_SECURITY };
  }
}

export function saveTeacherSecurityDefaults(teacherId: string, settings: ExamSecuritySettings) {
  if (typeof window === "undefined" || !teacherId) return;
  localStorage.setItem(storageKey(teacherId), JSON.stringify(settings));
}

/** Row shape for public.exam_settings */
export function toExamSettingsRow(examId: string, s: ExamSecuritySettings, totalMarks = 0) {
  return {
    exam_id: examId,
    fullscreen: s.fullscreen,
    tab_monitoring: s.tabMonitoring,
    max_tab_switches: s.maxTabSwitches,
    block_copy_paste: s.blockCopyPaste,
    randomize_questions: s.randomizeQuestions,
    randomize_options: s.randomizeOptions,
    require_camera: s.requireCamera,
    require_microphone: s.requireMicrophone,
    threshold_action: s.thresholdAction,
    total_marks: totalMarks,
  };
}

export type ExamSettingsRow = {
  exam_id: string;
  fullscreen: boolean;
  tab_monitoring: boolean;
  max_tab_switches: number;
  block_copy_paste: boolean;
  randomize_questions: boolean;
  randomize_options: boolean;
  require_camera: boolean;
  require_microphone: boolean;
  threshold_action: string;
  total_marks: number;
  instructions: string | null;
  result_visibility: string;
};

export function fromExamSettingsRow(row: ExamSettingsRow | null | undefined): ExamSecuritySettings {
  if (!row) return { ...DEFAULT_EXAM_SECURITY };
  return {
    fullscreen: row.fullscreen,
    tabMonitoring: row.tab_monitoring,
    maxTabSwitches: row.max_tab_switches,
    blockCopyPaste: row.block_copy_paste,
    randomizeQuestions: row.randomize_questions,
    randomizeOptions: row.randomize_options,
    requireCamera: row.require_camera,
    requireMicrophone: row.require_microphone,
    thresholdAction: (row.threshold_action as ExamSecuritySettings["thresholdAction"]) || "flag",
  };
}

export function securitySummaryLines(s: ExamSecuritySettings): string[] {
  return [
    `Fullscreen lockdown: ${s.fullscreen ? "On" : "Off"}`,
    `Tab monitoring: ${s.tabMonitoring ? `On (max ${s.maxTabSwitches})` : "Off"}`,
    `On threshold: ${s.thresholdAction}`,
    `Block copy/paste: ${s.blockCopyPaste ? "On" : "Off"}`,
    `Randomise questions: ${s.randomizeQuestions ? "On" : "Off"}`,
    `Randomise options: ${s.randomizeOptions ? "On" : "Off"}`,
    `Camera: ${s.requireCamera ? "Required" : "Not required"}`,
    `Microphone: ${s.requireMicrophone ? "Required" : "Not required"}`,
  ];
}
