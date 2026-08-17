/** Live exam monitoring helpers — presence, severity, filters (database-driven). */

export type MonitorFaceStatus =
  | "ok"
  | "none"
  | "multi"
  | "unclear"
  | "unavailable"
  | "unknown";

export type MonitorSeverity = "normal" | "warning" | "violation" | "offline" | "completed";

export type MonitorPresence = {
  cameraActive: boolean;
  faceStatus: MonitorFaceStatus;
  faceCount: number | null;
  lastSeenAt: string;
  fullscreen: boolean;
  micActive?: boolean;
  answeredCount?: number;
  totalQuestions?: number;
  timeRemainingSec?: number | null;
};

export const ONLINE_THRESHOLD_MS = 45_000;

export function isOnline(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= ONLINE_THRESHOLD_MS;
}

export function parsePresence(metadata: Record<string, unknown> | null | undefined): MonitorPresence {
  const m = metadata ?? {};
  const faceRaw = String(m.faceStatus ?? m.face_status ?? "unknown").toLowerCase();
  const faceStatus: MonitorFaceStatus =
    faceRaw === "ok" || faceRaw === "none" || faceRaw === "multi" || faceRaw === "unclear" || faceRaw === "unavailable"
      ? faceRaw
      : "unknown";
  const cam =
    m.cameraActive === true ||
    m.camera_active === true ||
    (faceStatus !== "unavailable" && faceStatus !== "unknown" && m.cameraActive !== false);

  return {
    cameraActive: Boolean(cam),
    faceStatus,
    faceCount: typeof m.faceCount === "number" ? m.faceCount : typeof m.face_count === "number" ? (m.face_count as number) : null,
    lastSeenAt: String(m.lastSeenAt ?? m.last_seen_at ?? ""),
    fullscreen: m.fullscreen === true || m.fullscreen_active === true,
    micActive: m.micActive === true || m.mic_active === true,
    answeredCount: typeof m.answeredCount === "number" ? m.answeredCount : undefined,
    totalQuestions: typeof m.totalQuestions === "number" ? m.totalQuestions : undefined,
    timeRemainingSec:
      typeof m.timeRemainingSec === "number"
        ? m.timeRemainingSec
        : typeof m.time_remaining_sec === "number"
          ? (m.time_remaining_sec as number)
          : null,
  };
}

export function severityFromPresence(
  status: string,
  presence: MonitorPresence,
  now = Date.now(),
): MonitorSeverity {
  const st = String(status || "").toLowerCase();
  if (["submitted", "completed", "terminated", "flagged"].includes(st)) return "completed";
  if (!isOnline(presence.lastSeenAt, now)) return "offline";
  if (!presence.cameraActive || presence.faceStatus === "unavailable") return "violation";
  if (presence.faceStatus === "multi") return "violation";
  if (presence.faceStatus === "none" || presence.faceStatus === "unclear") return "warning";
  return "normal";
}

export function faceLabel(presence: MonitorPresence): string {
  if (!presence.cameraActive || presence.faceStatus === "unavailable") return "Camera off";
  if (presence.faceStatus === "ok") return "1 face";
  if (presence.faceStatus === "none") return "No face";
  if (presence.faceStatus === "multi") {
    return presence.faceCount && presence.faceCount > 1 ? `${presence.faceCount} faces` : "2+ faces";
  }
  if (presence.faceStatus === "unclear") return "Unclear";
  return "Unknown";
}

export function severityBorderClass(sev: MonitorSeverity): string {
  switch (sev) {
    case "normal":
      return "border-emerald-400/80 ring-1 ring-emerald-400/30";
    case "warning":
      return "border-amber-400/90 ring-1 ring-amber-400/40";
    case "violation":
      return "border-red-500/90 ring-1 ring-red-500/40";
    case "offline":
      return "border-slate-400/70 ring-1 ring-slate-400/20";
    case "completed":
      return "border-slate-300 ring-1 ring-slate-200";
    default:
      return "border-slate-200";
  }
}

export function severityBadgeClass(sev: MonitorSeverity): string {
  switch (sev) {
    case "normal":
      return "bg-emerald-500 text-white";
    case "warning":
      return "bg-amber-500 text-white";
    case "violation":
      return "bg-red-600 text-white";
    case "offline":
      return "bg-slate-500 text-white";
    case "completed":
      return "bg-slate-400 text-white";
    default:
      return "bg-slate-400 text-white";
  }
}

export function eventSeverity(eventType: string, severity?: string | null): "low" | "medium" | "high" {
  if (severity === "high" || severity === "medium" || severity === "low") return severity;
  const t = eventType.toUpperCase();
  if (
    t.includes("MULTIPLE") ||
    t.includes("CAMERA_UNAVAILABLE") ||
    t.includes("CAMERA_PERMISSION") ||
    t.includes("AUTO_SUBMIT") ||
    t.includes("TERMINAT")
  )
    return "high";
  if (t.includes("NO_FACE") || t.includes("FACE_NOT") || t.includes("FULLSCREEN") || t.includes("TAB") || t.includes("UNCLEAR"))
    return "medium";
  return "low";
}

export function humanEventLabel(eventType: string, description?: string | null): string {
  if (description?.trim()) return description.trim();
  const t = eventType.toUpperCase();
  const map: Record<string, string> = {
    FACE_NOT_DETECTED: "No face detected",
    NO_FACE: "No face detected",
    MULTIPLE_FACES_DETECTED: "2 faces detected",
    MULTIPLE_FACES: "2 faces detected",
    ONE_FACE_DETECTED: "Face detected",
    ONE_FACE: "Face detected",
    CAMERA_UNAVAILABLE: "Camera turned off",
    CAMERA_PERMISSION_REVOKED: "Camera permission revoked",
    CAMERA_PERMISSION_DENIED: "Camera permission denied",
    CAMERA_PERMISSION_GRANTED: "Camera enabled",
    TAB_SWITCH: "Tab switch detected",
    FULLSCREEN_EXIT: "Fullscreen exited",
    CONNECTION_LOST: "Connection lost",
    CONNECTION_RESTORED: "Reconnected",
    MANUAL_SUBMIT: "Exam submitted",
    AUTO_SUBMIT: "Auto-submitted",
    WARNING_SHOWN: "Warning shown",
  };
  return map[t] ?? eventType.replaceAll("_", " ").toLowerCase();
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec) || sec < 0) return "—";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const d = Math.max(0, Math.floor((now - t) / 1000));
  if (d < 15) return "Just now";
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

/** Map ExamCameraPip security event → integrity event type + severity */
export function mapFaceSecurityEvent(kind: string, faceCount: number | null) {
  switch (kind) {
    case "ok":
      return { eventType: "ONE_FACE_DETECTED" as const, severity: "low" as const, description: "Face detected" };
    case "none":
      return {
        eventType: "FACE_NOT_DETECTED" as const,
        severity: "medium" as const,
        description: "No face detected",
      };
    case "multi":
      return {
        eventType: "MULTIPLE_FACES_DETECTED" as const,
        severity: "high" as const,
        description: faceCount && faceCount > 1 ? `${faceCount} faces detected` : "2 faces detected",
      };
    case "unclear":
      return {
        eventType: "FACE_NOT_DETECTED" as const,
        severity: "medium" as const,
        description: "Face unclear — please face the camera",
      };
    case "camera_blocked":
      return {
        eventType: "CAMERA_UNAVAILABLE" as const,
        severity: "high" as const,
        description: "Camera turned off or blocked",
      };
    default:
      return { eventType: "WARNING_SHOWN" as const, severity: "low" as const, description: kind };
  }
}
