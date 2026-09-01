#!/usr/bin/env python3
"""Fix officer live card identity: real name, matric, course, exam title."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OM = ROOT / "src/routes/officer.live-monitor.tsx"

om = OM.read_text()
oo = om

old_deps = "}, [attemptsQ.data, recentDoneQ.data, now, frames, screenFrames, feedMode, studentNamesQ.data, examEnrichQ.data]);"
new_deps = "}, [attemptsQ.data, recentDoneQ.data, now, frames, screenFrames, feedMode, studentNamesQ.data, nameByMatricQ.data, examEnrichQ.data, examsQ.data]);"
if old_deps in om:
    om = om.replace(old_deps, new_deps, 1)
    print("OK: useMemo deps")
else:
    print("FAIL: useMemo deps not found")

old_resolve = """        const resolved = studentNamesQ.data?.[String(a.student_id)];
        const byMatricKey = String(a.students?.matric_number || a.students?.student_id || (a.metadata as Record<string, unknown> | null)?.matricNumber || \"\").trim().toLowerCase();
        const fromMatricMap = byMatricKey ? nameByMatricQ.data?.[`matric:${byMatricKey}`] : undefined;
        const fromIdMap = nameByMatricQ.data?.[String(a.student_id)];
        const frameId = camFrame || frames[a.id] || frames[`student:${a.student_id}`] || null;
        const metaName = nameFromMetadata(a.metadata);
        const frameName = String(frameId?.studentName || \"\").trim();
        const fromJoin = studentDisplayName(a);
        const resolvedName = typeof resolved === \"string\"
          ? resolved.trim()
          : String((resolved as { name?: string } | undefined)?.name || \"\").trim();
        const nameCandidates = [resolvedName, fromIdMap, fromMatricMap, frameName, metaName, fromJoin].filter(
          (n) => n && n !== \"Student\" && n.toLowerCase() !== \"unknown\",
        );
        const name = nameCandidates[0] || \"Student\";
        const metaMatric = (() => {
          const mm = a.metadata;
          if (!mm || typeof mm !== \"object\") return \"\";
          const r = mm as Record<string, unknown>;
          return String(r.matricNumber || r.matric_number || r.matric || r.student_id || \"\").trim();
        })();
        const frameMatric = String(frameId?.matricNumber || \"\").trim();
        const resolvedMatric = typeof resolved === \"object\" && resolved
          ? String((resolved as { matric?: string }).matric || \"\").trim()
          : \"\";
        const matric = String(
          a.students?.matric_number || a.students?.student_id || resolvedMatric || frameMatric || metaMatric || \"\",
        ).trim() || \"\u2014\";
        const _c = a.examinations?.courses as unknown;
        const courseObj = Array.isArray(_c)
          ? (_c[0] as { code?: string; name?: string } | undefined)
          : (_c as { code?: string; name?: string } | null | undefined);
        const metaCourse = (() => {
          const mm = a.metadata;
          if (!mm || typeof mm !== \"object\") return \"\";
          const r = mm as Record<string, unknown>;
          return String(r.courseCode || r.course_code || \"\").trim();
        })();
        const metaTitle = (() => {
          const mm = a.metadata;
          if (!mm || typeof mm !== \"object\") return \"\";
          const r = mm as Record<string, unknown>;
          return String(r.examTitle || r.exam_title || \"\").trim();
        })();
        const courseCode = String(
          courseObj?.code || examEnrichQ.data?.[String(a.exam_id)]?.courseCode || frameId?.courseCode || metaCourse || \"\",
        ).trim();
        const courseName = String(courseObj?.name || examEnrichQ.data?.[String(a.exam_id)]?.courseName || \"\").trim();
        const course = courseCode && courseName && courseName.toLowerCase() !== courseCode.toLowerCase()
          ? `${courseCode} \u00b7 ${courseName}`
          : (courseCode || courseName || \"\u2014\");
        const title = String(
          a.examinations?.title || examEnrichQ.data?.[String(a.exam_id)]?.title || frameId?.examTitle || metaTitle || \"\",
        ).trim() || \"Exam\";"""

# Use actual unicode chars in the search string (file has them)
old_resolve = old_resolve.replace("\\u2014", "\u2014").replace("\\u00b7", "\u00b7")

new_resolve = """        const resolved = studentNamesQ.data?.[String(a.student_id)];
        const byMatricKey = String(a.students?.matric_number || a.students?.student_id || (a.metadata as Record<string, unknown> | null)?.matricNumber || "").trim().toLowerCase();
        const fromMatricMap = byMatricKey ? nameByMatricQ.data?.[`matric:${byMatricKey}`] : undefined;
        const fromIdMap = nameByMatricQ.data?.[String(a.student_id)];
        const frameId = camFrame || frames[a.id] || frames[`student:${a.student_id}`] || null;
        const metaName = nameFromMetadata(a.metadata);
        const frameName = String(frameId?.studentName || "").trim();
        const fromJoin = studentDisplayName(a);
        const resolvedName = typeof resolved === "string"
          ? resolved.trim()
          : String((resolved as { name?: string } | undefined)?.name || "").trim();
        // Prefer frame/meta first while joins load — live identity from student device
        const nameCandidates = [frameName, metaName, resolvedName, fromIdMap, fromMatricMap, fromJoin].filter(
          (n) => {
            const s = String(n || "").trim();
            if (!s) return false;
            if (s === "Student" || s.toLowerCase() === "unknown") return false;
            return true;
          },
        );
        const name = nameCandidates[0] || "Student";
        const metaMatric = (() => {
          const mm = a.metadata;
          if (!mm || typeof mm !== "object") return "";
          const r = mm as Record<string, unknown>;
          return String(r.matricNumber || r.matric_number || r.matric || r.student_id || "").trim();
        })();
        const frameMatric = String(frameId?.matricNumber || "").trim();
        const resolvedMatric = typeof resolved === "object" && resolved
          ? String((resolved as { matric?: string }).matric || "").trim()
          : "";
        const matric = String(
          a.students?.matric_number || a.students?.student_id || frameMatric || metaMatric || resolvedMatric || "",
        ).trim() || "\u2014";
        const _c = a.examinations?.courses as unknown;
        const courseObj = Array.isArray(_c)
          ? (_c[0] as { code?: string; name?: string } | undefined)
          : (_c as { code?: string; name?: string } | null | undefined);
        const metaCourse = (() => {
          const mm = a.metadata;
          if (!mm || typeof mm !== "object") return "";
          const r = mm as Record<string, unknown>;
          return String(r.courseCode || r.course_code || "").trim();
        })();
        const metaTitle = (() => {
          const mm = a.metadata;
          if (!mm || typeof mm !== "object") return "";
          const r = mm as Record<string, unknown>;
          return String(r.examTitle || r.exam_title || "").trim();
        })();
        const examFromList = (examsQ.data ?? []).find((e) => String(e.id) === String(a.exam_id));
        const listCourse = (() => {
          if (!examFromList) return { code: "", name: "" };
          const c = Array.isArray(examFromList.courses)
            ? (examFromList.courses[0] as { code?: string; name?: string } | undefined)
            : (examFromList.courses as { code?: string; name?: string } | null | undefined);
          return { code: String(c?.code || "").trim(), name: String(c?.name || "").trim() };
        })();
        const courseCode = String(
          courseObj?.code || examEnrichQ.data?.[String(a.exam_id)]?.courseCode || listCourse.code || frameId?.courseCode || metaCourse || "",
        ).trim();
        const courseName = String(
          courseObj?.name || examEnrichQ.data?.[String(a.exam_id)]?.courseName || listCourse.name || "",
        ).trim();
        const course = courseCode && courseName && courseName.toLowerCase() !== courseCode.toLowerCase()
          ? `${courseCode} \u00b7 ${courseName}`
          : (courseCode || courseName || "\u2014");
        const title = String(
          a.examinations?.title || examEnrichQ.data?.[String(a.exam_id)]?.title || (examFromList as { title?: string } | undefined)?.title || frameId?.examTitle || metaTitle || "",
        ).trim() || "Exam";"""

new_resolve = new_resolve.replace("\\u2014", "\u2014").replace("\\u00b7", "\u00b7")

if old_resolve in om:
    om = om.replace(old_resolve, new_resolve, 1)
    print("OK: stronger name/course resolve")
else:
    print("FAIL: resolve block not found")
    # debug: find nearby
    i = om.find("const resolved = studentNamesQ.data")
    print("found resolved at", i)
    if i > 0:
        print(repr(om[i:i+200]))

old_stale = """  const studentNamesQ = useQuery({
    queryKey: ["officer-live-student-names", schoolId, studentIdsKey],
    enabled: Boolean(schoolId && studentIdsKey),
    staleTime: 30_000,"""
new_stale = """  const studentNamesQ = useQuery({
    queryKey: ["officer-live-student-names", schoolId, studentIdsKey],
    enabled: Boolean(schoolId && studentIdsKey),
    staleTime: 8_000,
    refetchInterval: 12_000,"""
if old_stale in om:
    om = om.replace(old_stale, new_stale, 1)
    print("OK: studentNamesQ refetch")

if om != oo:
    OM.write_text(om)
    print("WRITTEN officer")
else:
    print("NO officer change")
print("ALL DONE")
