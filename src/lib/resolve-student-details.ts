/**
 * Student detail resolution for results / integrity / release.
 * Prefers staff server fn (bypasses RLS), then client fallbacks.
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

type Raw = {
  id: string;
  full_name?: string | null;
  matric_number?: string | null;
  student_id?: string | null;
  department_id?: string | null;
  level_id?: string | null;
  profile_id?: string | null;
};

export async function resolveStudentDetails(
  schoolId: string | null | undefined,
  studentIds: string[],
): Promise<Record<string, StudentDetail>> {
  const ids = [...new Set(studentIds.map(String).filter(Boolean))];
  const out: Record<string, StudentDetail> = {};
  if (!ids.length) return out;

  // 1) Server resolve (staff + service role) — primary for officers/teachers
  if (schoolId) {
    try {
      const { resolveStudentNamesForOfficer } = await import("@/lib/officer-student-names.functions");
      const map = await resolveStudentNamesForOfficer({
        data: { schoolId, studentIds: ids },
      });
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
  }

  const still = ids.filter((id) => !out[id] || out[id].fullName === "Student" || out[id].matric === "—");
  if (!still.length) return out;

  const byKey = new Map<string, Raw>();
  const ingest = (rows: Raw[] | null | undefined) => {
    for (const s of rows ?? []) {
      const id = String(s.id);
      byKey.set(id, s);
      if (s.profile_id) byKey.set(String(s.profile_id), s);
      if (s.student_id) byKey.set(String(s.student_id).toLowerCase(), s);
      if (s.matric_number) byKey.set(String(s.matric_number).toLowerCase(), s);
    }
  };

  for (let i = 0; i < still.length; i += 80) {
    const chunk = still.slice(i, i + 80);
    let q = supabase
      .from("students")
      .select("id, full_name, matric_number, student_id, department_id, level_id, profile_id")
      .in("id", chunk);
    if (schoolId) q = q.eq("school_id", schoolId);
    const { data } = await q;
    ingest(data as Raw[] | null);
  }

  const stillB = still.filter((id) => !byKey.has(id));
  if (stillB.length) {
    for (let i = 0; i < stillB.length; i += 80) {
      const chunk = stillB.slice(i, i + 80);
      let q = supabase
        .from("students")
        .select("id, full_name, matric_number, student_id, department_id, level_id, profile_id")
        .in("profile_id", chunk);
      if (schoolId) q = q.eq("school_id", schoolId);
      const { data } = await q;
      ingest(data as Raw[] | null);
    }
  }

  if (schoolId) {
    const unresolved = still.filter((id) => {
      const s = byKey.get(id) || byKey.get(id.toLowerCase());
      return !s || (!(s.full_name || "").trim() && !s.matric_number);
    });
    if (unresolved.length) {
      const { data: all } = await supabase
        .from("students")
        .select("id, full_name, matric_number, student_id, department_id, level_id, profile_id")
        .eq("school_id", schoolId)
        .limit(1200);
      ingest(all as Raw[] | null);
    }
  }

  const needProf: { key: string; profileId: string }[] = [];
  for (const id of still) {
    const s = byKey.get(id) || byKey.get(id.toLowerCase());
    if (s && !(s.full_name || "").trim() && s.profile_id) {
      needProf.push({ key: id, profileId: String(s.profile_id) });
    }
  }
  if (needProf.length) {
    const pids = [...new Set(needProf.map((x) => x.profileId))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", pids.slice(0, 250));
    const pmap = new Map((profiles ?? []).map((p) => [p.id, String(p.full_name || "").trim()]));
    for (const { key, profileId } of needProf) {
      const n = pmap.get(profileId);
      const s = byKey.get(key) || byKey.get(key.toLowerCase());
      if (n && s) byKey.set(key, { ...s, full_name: n });
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
    const fullName = String(s.full_name || "").trim() || "Student";
    const matric = String(s.matric_number || s.student_id || "").trim() || "—";
    const detail: StudentDetail = {
      fullName,
      matric,
      departmentId: s.department_id ?? null,
      levelId: s.level_id ?? null,
      departmentName: (s.department_id && deptNames.get(s.department_id)) || "—",
      levelName: (s.level_id && levelNames.get(s.level_id)) || "—",
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

export function integritySeverityBand(
  eventType: string,
  severity: string | null | undefined,
): "low" | "medium" | "high" {
  const t = String(eventType || "").toUpperCase();
  const s = String(severity || "").toLowerCase();
  if (
    /MULTIPLE.?FACE|MULTI.?FACE|FACE.?MULTIPLE/.test(t) ||
    /TAB.?SWITCH|TAB_SWITCH|LEFT.?THE.?EXAM/.test(t) ||
    /TERMINAT|AUTO.?SUBMIT|FORCE.?SUBMIT|POST.?EXAM|POST_EXAM/.test(t) ||
    s === "high" ||
    s === "critical"
  ) {
    return "high";
  }
  if (/NO.?FACE|FACE.?NOT|FACE_NOT_DETECTED|FACE.?MISSING/.test(t) || s === "medium" || s === "warning") {
    return "medium";
  }
  if (/RESUMED|RESUME|RESULTS.?READ|LOW|INFO/.test(t) || s === "low" || s === "info") {
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
