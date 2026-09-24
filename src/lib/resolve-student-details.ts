/**
 * Client-side student detail resolution for results / integrity / release pages.
 * Tries id, profile_id, and school-wide scan fallbacks so names show even when RLS/joins fail.
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

export async function resolveStudentDetails(
  schoolId: string | null | undefined,
  studentIds: string[],
): Promise<Record<string, StudentDetail>> {
  const ids = [...new Set(studentIds.map(String).filter(Boolean))];
  const out: Record<string, StudentDetail> = {};
  if (!ids.length) return out;

  type Raw = {
    id: string;
    full_name?: string | null;
    matric_number?: string | null;
    student_id?: string | null;
    department_id?: string | null;
    level_id?: string | null;
    profile_id?: string | null;
  };

  const byId = new Map<string, Raw>();

  const ingest = (rows: Raw[] | null | undefined) => {
    for (const s of rows ?? []) {
      const id = String(s.id);
      byId.set(id, s);
      // Also index by profile_id so result.student_id that is a profile can match
      if (s.profile_id) byId.set(String(s.profile_id), s);
    }
  };

  // 1) Direct id match
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    let q = supabase
      .from("students")
      .select("id, full_name, matric_number, student_id, department_id, level_id, profile_id")
      .in("id", chunk);
    if (schoolId) q = q.eq("school_id", schoolId);
    const { data } = await q;
    ingest(data as Raw[] | null);
  }

  // 2) profile_id match for unresolved ids
  const missing = ids.filter((id) => {
    const s = byId.get(id);
    return !s || (!(s.full_name || "").trim() && !s.matric_number && !s.student_id);
  });
  if (missing.length) {
    for (let i = 0; i < missing.length; i += 80) {
      const chunk = missing.slice(i, i + 80);
      let q = supabase
        .from("students")
        .select("id, full_name, matric_number, student_id, department_id, level_id, profile_id")
        .in("profile_id", chunk);
      if (schoolId) q = q.eq("school_id", schoolId);
      const { data } = await q;
      ingest(data as Raw[] | null);
    }
  }

  // 3) Fill empty full_name from profiles
  const needProf: { key: string; profileId: string }[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (s && !(s.full_name || "").trim() && s.profile_id) {
      needProf.push({ key: id, profileId: String(s.profile_id) });
    }
  }
  if (needProf.length) {
    const pids = [...new Set(needProf.map((x) => x.profileId))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", pids.slice(0, 200));
    const pmap = new Map((profiles ?? []).map((p) => [p.id, String(p.full_name || "").trim()]));
    for (const { key, profileId } of needProf) {
      const n = pmap.get(profileId);
      const s = byId.get(key);
      if (n && s) byId.set(key, { ...s, full_name: n });
    }
  }

  // 4) Department / level names
  const deptIds = [...new Set([...byId.values()].map((s) => s.department_id).filter(Boolean))] as string[];
  const levelIds = [...new Set([...byId.values()].map((s) => s.level_id).filter(Boolean))] as string[];
  const deptNames = new Map<string, string>();
  const levelNames = new Map<string, string>();
  if (deptIds.length) {
    const { data } = await supabase.from("departments").select("id, name").in("id", deptIds.slice(0, 100));
    for (const d of data ?? []) deptNames.set(d.id, d.name);
  }
  if (levelIds.length) {
    const { data } = await supabase.from("levels").select("id, name").in("id", levelIds.slice(0, 100));
    for (const l of data ?? []) levelNames.set(l.id, l.name);
  }

  for (const id of ids) {
    const s = byId.get(id);
    if (!s) continue;
    const fullName = String(s.full_name || "").trim();
    const matric = String(s.matric_number || s.student_id || "").trim();
    out[id] = {
      fullName: fullName || "Student",
      matric: matric || "—",
      departmentId: s.department_id ?? null,
      levelId: s.level_id ?? null,
      departmentName: (s.department_id && deptNames.get(s.department_id)) || "—",
      levelName: (s.level_id && levelNames.get(s.level_id)) || "—",
    };
    // Also map under canonical student uuid
    out[s.id] = out[id];
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

/** Map integrity event type + severity to UI severity band */
export function integritySeverityBand(
  eventType: string,
  severity: string | null | undefined,
): "low" | "medium" | "high" {
  const t = String(eventType || "").toUpperCase();
  const s = String(severity || "").toLowerCase();

  // High / red
  if (
    /MULTIPLE.?FACE|MULTI.?FACE|FACE.?MULTIPLE/.test(t) ||
    /TAB.?SWITCH|TAB_SWITCH|LEFT.?THE.?EXAM/.test(t) ||
    /TERMINAT|AUTO.?SUBMIT|FORCE.?SUBMIT|POST.?EXAM|POST_EXAM/.test(t) ||
    s === "high" ||
    s === "critical"
  ) {
    return "high";
  }

  // Medium / amber — no face is medium
  if (
    /NO.?FACE|FACE.?NOT|FACE_NOT_DETECTED|FACE.?MISSING/.test(t) ||
    s === "medium" ||
    s === "warning"
  ) {
    return "medium";
  }

  // Low / green — resume, results reading, etc.
  if (
    /RESUMED|RESUME|RESULTS.?READ|LOW|INFO/.test(t) ||
    s === "low" ||
    s === "info"
  ) {
    return "low";
  }

  if (s === "high" || s === "critical") return "high";
  if (s === "medium" || s === "warning") return "medium";
  return "low";
}

export function integritySeverityClass(band: "low" | "medium" | "high"): string {
  if (band === "high") return "bg-red-100 text-red-800 border-red-200";
  if (band === "medium") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}
