/**
 * Student detail resolution for results / integrity / release.
 * Production students table has NO full_name — names live on profiles only.
 */
import { supabase } from "@/integrations/supabase/client";

export type StudentDetail = {
  fullName: string;
  matric: string;
  departmentId: string | null;
  levelId: string | null;
  departmentName: string;
  levelName: string;
};

type StudentRow = {
  id: string;
  matric_number?: string | null;
  student_id?: string | null;
  department_id?: string | null;
  level_id?: string | null;
  profile_id?: string | null;
};

const STUDENT_COLS = "id, matric_number, student_id, department_id, level_id, profile_id";

export async function resolveStudentDetails(
  schoolId: string,
  studentIds: string[],
): Promise<Record<string, StudentDetail>> {
  const ids = [...new Set(studentIds.map(String).filter(Boolean))];
  const out: Record<string, StudentDetail> = {};
  if (!schoolId || !ids.length) return out;

  // 1) Server (service role) — preferred
  try {
    const { resolveStudentNamesForOfficer } = await import("@/lib/officer-student-names.functions");
    const map = await resolveStudentNamesForOfficer({
      data: { schoolId, studentIds: ids },
    } as never);
    if (map && typeof map === "object") {
      for (const id of ids) {
        const hit = map[id];
        if (!hit) continue;
        const fullName = String(hit.full_name || "").trim() || "Student";
        const matric = String(hit.matric_number || hit.student_id || "").trim() || "—";
        const detail: StudentDetail = {
          fullName,
          matric,
          departmentId: null,
          levelId: null,
          departmentName: String(hit.department_name || "").trim() || "—",
          levelName: String(hit.level_name || "").trim() || "—",
        };
        out[id] = detail;
      }
    }
  } catch (e) {
    console.warn("[resolveStudentDetails] server", e);
  }

  const still = ids.filter(
    (id) => !out[id] || out[id].fullName === "Student" || !out[id].fullName || out[id].matric === "—",
  );
  if (!still.length) return out;

  // 2) Client fallback — no full_name column on students
  const byKey = new Map<string, StudentRow>();
  try {
    const { data: byId } = await supabase
      .from("students")
      .select(STUDENT_COLS)
      .eq("school_id", schoolId)
      .in("id", still.slice(0, 300));
    for (const s of (byId ?? []) as StudentRow[]) {
      byKey.set(String(s.id), s);
      if (s.profile_id) byKey.set(String(s.profile_id), s);
      if (s.student_id) byKey.set(String(s.student_id), s);
      if (s.matric_number) byKey.set(String(s.matric_number), s);
    }

    const missing = still.filter((id) => !byKey.has(id));
    if (missing.length) {
      const { data: byProf } = await supabase
        .from("students")
        .select(STUDENT_COLS)
        .eq("school_id", schoolId)
        .in("profile_id", missing.slice(0, 200));
      for (const s of (byProf ?? []) as StudentRow[]) {
        byKey.set(String(s.id), s);
        if (s.profile_id) byKey.set(String(s.profile_id), s);
      }
    }
  } catch (e) {
    console.warn("[resolveStudentDetails] client students", e);
  }

  // Profiles for names
  const pids = [
    ...new Set(
      [...byKey.values()]
        .map((s) => s.profile_id)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const pmap = new Map<string, string>();
  if (pids.length) {
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", pids.slice(0, 300));
      for (const p of profiles ?? []) {
        const n = String(p.full_name || "").trim();
        if (n) pmap.set(String(p.id), n);
      }
    } catch {
      /* ignore */
    }
  }

  const deptIds = [...new Set([...byKey.values()].map((s) => s.department_id).filter(Boolean))] as string[];
  const levelIds = [...new Set([...byKey.values()].map((s) => s.level_id).filter(Boolean))] as string[];
  const deptNames = new Map<string, string>();
  const levelNames = new Map<string, string>();
  if (deptIds.length) {
    const { data } = await supabase.from("departments").select("id, name").in("id", deptIds.slice(0, 150));
    for (const d of data ?? []) deptNames.set(d.id, d.name);
  }
  if (levelIds.length) {
    const { data } = await supabase.from("levels").select("id, name").in("id", levelIds.slice(0, 150));
    for (const l of data ?? []) levelNames.set(l.id, l.name);
  }

  for (const id of still) {
    const s = byKey.get(id) || byKey.get(id.toLowerCase());
    if (!s) continue;
    const fullName =
      (s.profile_id && pmap.get(String(s.profile_id))) ||
      out[id]?.fullName ||
      "Student";
    const matric = String(s.matric_number || s.student_id || "").trim() || "—";
    const detail: StudentDetail = {
      fullName: fullName === "Student" && out[id]?.fullName ? out[id].fullName : fullName,
      matric,
      departmentId: s.department_id ?? null,
      levelId: s.level_id ?? null,
      departmentName: (s.department_id && deptNames.get(s.department_id)) || out[id]?.departmentName || "—",
      levelName: (s.level_id && levelNames.get(s.level_id)) || out[id]?.levelName || "—",
    };
    out[id] = detail;
    out[s.id] = detail;
  }

  return out;
}

export function gradeColorClass(grade: string | null | undefined): string {
  const g = String(grade || "").trim().toUpperCase();
  if (!g || g === "—") return "text-slate-700";
  if (g === "A" || g === "B") return "text-emerald-600 font-extrabold";
  if (g === "C") return "text-amber-600 font-extrabold";
  if (g === "D" || g === "E") return "text-orange-600 font-extrabold";
  if (g === "F") return "text-red-600 font-extrabold";
  return "text-slate-800 font-bold";
}

/**
 * Officer integrity chip colors (product rules):
 * - MULTIPLE_FACES / TAB_SWITCH / OFFICER_PAUSE → red (high)
 * - FACE_NOT_DETECTED → amber (medium)
 * - ONE_FACE_DETECTED / OFFICER_RELEASE → green (low)
 */
export function integritySeverityBand(
  eventType: string,
  severity: string | null | undefined,
): "low" | "medium" | "high" {
  const t = String(eventType || "").toUpperCase().replace(/\s+/g, "_");
  if (
    t.includes("MULTIPLE_FACE") ||
    t.includes("MULTI_FACE") ||
    t.includes("TAB_SWITCH") ||
    t.includes("TAB SWITCH") ||
    t.includes("OFFICER_PAUSE") ||
    t.includes("OFFICER_PAUSE") ||
    t === "OFFICER_PAUSE"
  ) {
    return "high";
  }
  if (t.includes("FACE_NOT") || t.includes("NO_FACE") || t.includes("FACE_NOT_DETECTED")) {
    return "medium";
  }
  if (
    t.includes("ONE_FACE") ||
    t.includes("OFFICER_RELEASE") ||
    (t.includes("FACE_DETECTED") && !t.includes("NOT") && !t.includes("MULTI"))
  ) {
    return "low";
  }
  const s = String(severity || "").toLowerCase();
  if (s === "high" || s === "critical") return "high";
  if (s === "medium" || s === "warn" || s === "warning") return "medium";
  if (t.includes("TAB")) return "high";
  if (t.includes("MULTI")) return "high";
  if (t.includes("FACE")) return "medium";
  return "low";
}

/** Tailwind classes for integrity event severity (green / amber / red). */
export function integritySeverityClass(band: "low" | "medium" | "high"): string {
  if (band === "high") return "text-red-700 bg-red-50 border-red-200";
  if (band === "medium") return "text-amber-800 bg-amber-50 border-amber-200";
  return "text-emerald-700 bg-emerald-50 border-emerald-200";
}

/** 0–100 integrity health from event counts (higher = better). */
export function integrityScoreFromSummary(summary: Record<string, number>): number {
  let score = 100;
  for (const [k, v] of Object.entries(summary)) {
    const n = Number(v) || 0;
    if (!n) continue;
    const t = k.toUpperCase();
    if (t.includes("MULTIPLE_FACE") || t.includes("TAB_SWITCH") || t.includes("OFFICER_PAUSE")) {
      score -= Math.min(40, n * 8);
    } else if (t.includes("FACE_NOT") || t.includes("NO_FACE")) {
      score -= Math.min(25, n * 4);
    } else if (t.includes("OFFICER_RELEASE") || t.includes("ONE_FACE")) {
      score += Math.min(10, n);
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

