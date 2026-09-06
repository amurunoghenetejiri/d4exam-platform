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
  faceDetection: false,
  maxFaceWarnings: 5,
  faceViolationAction: "flag",
  thresholdAction: "flag",
  pauseDurationSeconds: 300,
  resultVisibility: "after_officer_release",
  questionsToAnswer: null,
};

export const SECURITY_MARKER = "[[D4_SECURITY_JSON]]";
export const META_MARKER = "[[D4_EXAM_META]]";

const storageKey = (teacherId: string) => `d4exam.teacher.security.${teacherId}`;

/** Drop undefined keys so they cannot overwrite defaults / other sources. */
function definedOnly<T extends Record<string, unknown>>(obj: T | null | undefined): Partial<T> {
  if (!obj) return {};
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

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
  const merged = { ...DEFAULT_EXAM_SECURITY, ...definedOnly(partial as Record<string, unknown>) } as ExamSecuritySettings;
  const mode = resolveScreenShareMode(merged);
  merged.screenShareMode = mode;
  merged.requireScreenShare = mode === "required";
  // Face detection always implies camera
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

/**
 * Full row written to exam_settings — includes face / screen columns.
 * Migration 20260815130000 adds those columns; upsert falls back if missing.
 */
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
    require_camera: Boolean(n.requireCamera || n.faceDetection),
    require_microphone: Boolean(n.requireMicrophone),
    require_screen_share: Boolean(n.requireScreenShare),
    screen_share_mode: n.screenShareMode,
    face_detection: Boolean(n.faceDetection),
    max_face_warnings: n.maxFaceWarnings ?? 5,
    face_violation_action: n.faceViolationAction ?? "flag",
    threshold_action: n.thresholdAction,
    pause_duration_seconds: n.pauseDurationSeconds ?? 300,
    result_visibility: n.resultVisibility,
    total_marks: totalMarks,
    questions_to_answer: questionsToAnswer ?? n.questionsToAnswer,
    updated_at: new Date().toISOString(),
  };
}

/** Columns that exist on older DBs before the face/screen migration. */
export function toExamSettingsRowLegacy(
  examId: string,
  s: ExamSecuritySettings,
  totalMarks = 0,
  questionsToAnswer: number | null = null,
) {
  const full = toExamSettingsRow(examId, s, totalMarks, questionsToAnswer);
  const {
    require_screen_share: _a,
    screen_share_mode: _b,
    face_detection: _c,
    max_face_warnings: _d,
    face_violation_action: _e,
    ...legacy
  } = full;
  return legacy;
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
  pause_duration_seconds?: number | null;
  result_visibility?: string | null;
  total_marks?: number | null;
  instructions?: string | null;
  questions_to_answer?: number | null;
};

function parseSecurityJson(description: string | null | undefined): Partial<ExamSecuritySettings> {
  if (!description || !description.includes(SECURITY_MARKER)) return {};
  try {
    const raw = description.split(SECURITY_MARKER)[1]?.split(META_MARKER)[0] ?? "";
    let depth = 0;
    let end = -1;
    const start = raw.indexOf("{");
    if (start < 0) return {};
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
    if (end < 0) return {};
    return JSON.parse(raw.slice(start, end + 1)) as Partial<ExamSecuritySettings>;
  } catch {
    return {};
  }
}

/**
 * Single source of truth merge:
 * 1) description JSON (always written on teacher save)
 * 2) exam_settings row columns (authoritative when present, including explicit false)
 * Neither source may inject `undefined` over the other.
 */
export function fromExamSettingsRow(
  row: ExamSettingsRow | null | undefined,
  description?: string | null,
): ExamSecuritySettings {
  const fromDesc = definedOnly(parseSecurityJson(description) as Record<string, unknown>) as Partial<ExamSecuritySettings>;

  const fromRow: Partial<ExamSecuritySettings> = {};
  if (row) {
    if (row.fullscreen != null) fromRow.fullscreen = row.fullscreen;
    if (row.tab_monitoring != null) fromRow.tabMonitoring = row.tab_monitoring;
    if (row.max_tab_switches != null) fromRow.maxTabSwitches = row.max_tab_switches;
    if (row.block_copy_paste != null) fromRow.blockCopyPaste = row.block_copy_paste;
    if (row.randomize_questions != null) fromRow.randomizeQuestions = row.randomize_questions;
    if (row.randomize_options != null) fromRow.randomizeOptions = row.randomize_options;
    if (row.require_camera != null) fromRow.requireCamera = row.require_camera;
    if (row.require_microphone != null) fromRow.requireMicrophone = row.require_microphone;
    if (row.require_screen_share != null) fromRow.requireScreenShare = row.require_screen_share;
    if (row.screen_share_mode != null) fromRow.screenShareMode = row.screen_share_mode as ScreenShareMode;
    if (row.face_detection != null) fromRow.faceDetection = row.face_detection;
    if (row.max_face_warnings != null) fromRow.maxFaceWarnings = row.max_face_warnings;
    if (row.face_violation_action != null) {
      fromRow.faceViolationAction = row.face_violation_action as ExamSecuritySettings["faceViolationAction"];
    }
    if (row.threshold_action != null) {
      fromRow.thresholdAction = row.threshold_action as ExamSecuritySettings["thresholdAction"];
    }
    if (row.pause_duration_seconds != null) {
      fromRow.pauseDurationSeconds = Number(row.pause_duration_seconds) || 300;
    }
    if (row.result_visibility != null) {
      fromRow.resultVisibility = row.result_visibility as ExamSecuritySettings["resultVisibility"];
    }
    if (row.questions_to_answer != null) fromRow.questionsToAnswer = row.questions_to_answer;
  }

  // Description JSON is always written on teacher save and is the most complete snapshot.
  // Table columns fill gaps when description is absent (older exams / migration).
  // When description has explicit keys, those win so students never see false "Off"
  // just because a row defaulted require_camera/face_detection to false.
  const hasDesc = Object.keys(fromDesc).length > 0;
  return normalizeSecuritySettings(
    hasDesc
      ? { ...fromRow, ...fromDesc }
      : { ...fromDesc, ...fromRow },
  );
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
  const partial = parseSecurityJson(description);
  if (!Object.keys(partial).length) return null;
  return normalizeSecuritySettings(partial);
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
    `On threshold: ${n.thresholdAction}${n.thresholdAction === "pause" ? ` (${Math.floor((n.pauseDurationSeconds ?? 300) / 60)}m ${(n.pauseDurationSeconds ?? 300) % 60}s)` : ""}`,
    `Block copy/paste: ${n.blockCopyPaste ? "On" : "Off"}`,
    `Randomise questions: ${n.randomizeQuestions ? "On" : "Off"}`,
    `Randomise options: ${n.randomizeOptions ? "On" : "Off"}`,
    `Camera monitoring: ${n.requireCamera ? "Required" : "Off"}`,
    `Face detection: ${n.faceDetection ? `On (max ${n.maxFaceWarnings} → ${n.faceViolationAction})` : "Off"}`,
    `Screen sharing: ${shareLabel}`,
    `Microphone: ${n.requireMicrophone ? "Required" : "Not required"}`,
    `Result release: ${n.resultVisibility}`,
  ];
}
