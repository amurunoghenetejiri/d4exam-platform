import type { ExamSecuritySettings, ScreenShareMode } from "@/types";

export const DEFAULT_EXAM_SECURITY: ExamSecuritySettings = {
  fullscreen: true,
  tabMonitoring: true,
  maxTabSwitches: 5,
  blockCopyPaste: true,
  randomizeQuestions: true,
  randomizeOptions: true,
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
  // Only columns known to exist on exam_settings (face/screen fields live in description JSON)
  return {
    exam_id: examId,
    fullscreen: n.fullscreen,
    tab_monitoring: n.tabMonitoring,
    max_tab_switches: n.maxTabSwitches,
    block_copy_paste: n.blockCopyPaste,
    randomize_questions: n.randomizeQuestions,
    randomize_options: n.randomizeOptions,
    require_camera: n.requireCamera || n.faceDetection,
    require_microphone: n.requireMicrophone,
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
  // Description JSON is the source of truth for face/screen fields (may not exist as columns)
  let fromDesc: Partial<ExamSecuritySettings> = {};
  if (description && description.includes(SECURITY_MARKER)) {
    try {
      const raw = description.split(SECURITY_MARKER)[1]?.split(META_MARKER)[0] ?? "";
      let depth = 0;
      let end = -1;
      const start = raw.indexOf("{");
      if (start >= 0) {
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
        if (end >= 0) {
          fromDesc = JSON.parse(raw.slice(start, end + 1)) as Partial<ExamSecuritySettings>;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (row) {
    // Description JSON is authoritative for face/screen fields (table often lacks those columns).
    // Prefer fromDesc when present; fall back to row values.
    return normalizeSecuritySettings({
      ...fromDesc,
      fullscreen: row.fullscreen ?? fromDesc.fullscreen,
      tabMonitoring: row.tab_monitoring ?? fromDesc.tabMonitoring,
      maxTabSwitches: row.max_tab_switches ?? fromDesc.maxTabSwitches,
      blockCopyPaste: row.block_copy_paste ?? fromDesc.blockCopyPaste,
      randomizeQuestions: row.randomize_questions ?? fromDesc.randomizeQuestions,
      randomizeOptions: row.randomize_options ?? fromDesc.randomizeOptions,
      requireCamera:
        fromDesc.requireCamera ?? row.require_camera ?? fromDesc.requireCamera,
      requireMicrophone: row.require_microphone ?? fromDesc.requireMicrophone,
      requireScreenShare:
        fromDesc.requireScreenShare ?? row.require_screen_share ?? fromDesc.requireScreenShare,
      screenShareMode:
        (fromDesc.screenShareMode as ScreenShareMode | undefined) ??
        (row.screen_share_mode as ScreenShareMode) ??
        fromDesc.screenShareMode,
      faceDetection: fromDesc.faceDetection ?? row.face_detection ?? fromDesc.faceDetection,
      maxFaceWarnings: fromDesc.maxFaceWarnings ?? row.max_face_warnings ?? fromDesc.maxFaceWarnings,
      faceViolationAction:
        (fromDesc.faceViolationAction as ExamSecuritySettings["faceViolationAction"] | undefined) ??
        (row.face_violation_action as ExamSecuritySettings["faceViolationAction"]) ??
        fromDesc.faceViolationAction,
      thresholdAction:
        (row.threshold_action as ExamSecuritySettings["thresholdAction"]) ?? fromDesc.thresholdAction,
      resultVisibility:
        (row.result_visibility as ExamSecuritySettings["resultVisibility"]) ?? fromDesc.resultVisibility,
      questionsToAnswer: row.questions_to_answer ?? fromDesc.questionsToAnswer,
    });
  }

  if (Object.keys(fromDesc).length) return normalizeSecuritySettings(fromDesc);
  return { ...DEFAULT_EXAM_SECURITY };
}

export function stripInternalMarkers(description: string | null | undefined): string {
  if (!description) return "";
  let s = description;
  const secIdx = s.indexOf(SECURITY_MARKER);
  if (secIdx >= 0) s = s.slice(0, secIdx);
  const metaIdx = s.indexOf(META_MARKER);
  if (metaIdx >= 0) {
    const before = s.slice(0, metaIdx);
    const after = s.slice(metaIdx + META_MARKER.length);
    const rest = after.replace(/^\s*\{[^\n]*\}/, "");
    s = before + rest;
  }
  s = s
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith(SECURITY_MARKER) && !t.startsWith(META_MARKER);
    })
    .join("\n")
    .trim();
  return s;
}

export function embedSecurityInDescription(
  description: string | null | undefined,
  settings: ExamSecuritySettings,
): string {
  const clean = stripInternalMarkers(description);
  const blob = `${SECURITY_MARKER}${JSON.stringify(normalizeSecuritySettings(settings))}`;
  return clean ? `${clean}\n${blob}` : blob;
}

export function parseSecurityFromDescription(
  description: string | null | undefined,
): ExamSecuritySettings | null {
  if (!description) return null;
  const idx = description.indexOf(SECURITY_MARKER);
  if (idx < 0) return null;
  try {
    let raw = description.slice(idx + SECURITY_MARKER.length).trim();
    const start = raw.indexOf("{");
    if (start < 0) return null;
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
    if (end < 0) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ExamSecuritySettings>;
    return normalizeSecuritySettings(parsed);
  } catch {
    return null;
  }
}

export function stripSecurityMarker(description: string | null | undefined): string {
  return stripInternalMarkers(description);
}

export function securitySummaryLines(s: ExamSecuritySettings): string[] {
  const n = normalizeSecuritySettings(s);
  const shareLabel =
    n.screenShareMode === "required"
      ? "Required"
      : n.screenShareMode === "optional"
        ? "Optional"
        : "Disabled";
  return [
    `Fullscreen lockdown: ${n.fullscreen ? "On" : "Off"}`,
    `Tab monitoring: ${n.tabMonitoring ? `On (max ${n.maxTabSwitches})` : "Off"}`,
    `On threshold: ${n.thresholdAction}`,
    `Block copy/paste: ${n.blockCopyPaste ? "On" : "Off"}`,
    `Randomise questions: ${n.randomizeQuestions ? "On" : "Off"}`,
    `Randomise options: ${n.randomizeOptions ? "On" : "Off"}`,
    `Camera monitoring: ${n.requireCamera ? "Required" : "Off"}`,
    `Face detection: ${n.faceDetection && n.requireCamera ? `On (max ${n.maxFaceWarnings} -> ${n.faceViolationAction})` : "Off"}`,
    `Screen sharing: ${shareLabel}`,
    `Microphone: ${n.requireMicrophone ? "Required" : "Not required"}`,
    `Result release: ${n.resultVisibility}`,
  ];
}
