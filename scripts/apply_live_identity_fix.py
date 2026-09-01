#!/usr/bin/env python3
"""Fix live student name/matric/course on officer monitoring. No UI redesign."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OM = ROOT / "src/routes/officer.live-monitor.tsx"
CBT = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"

om = OM.read_text()
oo = om

om = om.replace(
    "type FrameEntry = { src: string; ts: number; faceStatus?: string; cameraActive?: boolean; answeredCount?: number; totalQuestions?: number; timeRemainingSec?: number | null; studentName?: string; matricNumber?: string; courseCode?: string; examTitle?: string };",
    "type FrameEntry = { src: string; ts: number; faceStatus?: string; cameraActive?: boolean; answeredCount?: number; totalQuestions?: number; timeRemainingSec?: number | null; studentName?: string; matricNumber?: string; courseCode?: string; examTitle?: string; studentId?: string; examId?: string };",
)

needle = "examTitle: p.examTitle ? String(p.examTitle).trim() : undefined,\n        };"
if needle in om and "studentId: String(p.studentId" not in om:
    om = om.replace(
        needle,
        "examTitle: p.examTitle ? String(p.examTitle).trim() : undefined,\n"
        "          studentId: String(p.studentId || (p as { student_id?: string }).student_id || \"\").trim() || undefined,\n"
        "          examId: String(p.examId || \"\").trim() || undefined,\n"
        "        };",
        1,
    )
    print("OK: frame entry fields")

idx = om.find("const frameOnly: AttemptRow[] = [];")
if idx > 0:
    push = om.find("frameOnly.push({", idx)
    end_push = om.find("});", push) + 3
    new_push = (
        "frameOnly.push({\n"
        "        id: key,\n"
        "        exam_id: String(entry.examId || \"\"),\n"
        "        student_id: String(entry.studentId || key),\n"
        "        status: \"in_progress\",\n"
        "        started_at: new Date(entry.ts).toISOString(),\n"
        "        updated_at: new Date(entry.ts).toISOString(),\n"
        "        tab_switch_count: 0,\n"
        "        metadata: {\n"
        "          lastSeenAt: new Date(entry.ts).toISOString(),\n"
        "          studentName: entry.studentName || undefined,\n"
        "          matricNumber: entry.matricNumber || undefined,\n"
        "          courseCode: entry.courseCode || undefined,\n"
        "          examTitle: entry.examTitle || undefined,\n"
        "        },\n"
        "        examinations: entry.examTitle\n"
        "          ? { title: entry.examTitle, status: \"ongoing\", courses: entry.courseCode ? { code: entry.courseCode } : null }\n"
        "          : null,\n"
        "        students: (entry.studentName || entry.matricNumber)\n"
        "          ? {\n"
        "              full_name: entry.studentName || null,\n"
        "              matric_number: entry.matricNumber || null,\n"
        "              student_id: entry.matricNumber || null,\n"
        "            }\n"
        "          : null,\n"
        "      })"
    )
    om = om[:push] + new_push + om[end_push:]
    print("OK: frameOnly")
else:
    print("FAIL: frameOnly")

anchor = "const resolved = studentNamesQ.data?.[String(a.student_id)];"
start = om.find(anchor)
end = om.find("const bars = isDone", start) if start >= 0 else -1
if start >= 0 and end > start:
    new_block = (
        "const resolved = studentNamesQ.data?.[String(a.student_id)];\n"
        "        const frameId = camFrame || frames[a.id] || frames[`student:${a.student_id}`] || null;\n"
        "        const metaName = nameFromMetadata(a.metadata);\n"
        "        const frameName = String(frameId?.studentName || \"\").trim();\n"
        "        const fromJoin = studentDisplayName(a);\n"
        "        const resolvedName = typeof resolved === \"string\"\n"
        "          ? resolved.trim()\n"
        "          : String((resolved as { name?: string } | undefined)?.name || \"\").trim();\n"
        "        const nameCandidates = [resolvedName, frameName, metaName, fromJoin].filter(\n"
        "          (n) => n && n !== \"Student\" && n.toLowerCase() !== \"unknown\",\n"
        "        );\n"
        "        const name = nameCandidates[0] || \"Student\";\n"
        "        const metaMatric = (() => {\n"
        "          const mm = a.metadata;\n"
        "          if (!mm || typeof mm !== \"object\") return \"\";\n"
        "          const r = mm as Record<string, unknown>;\n"
        "          return String(r.matricNumber || r.matric_number || r.matric || r.student_id || \"\").trim();\n"
        "        })();\n"
        "        const frameMatric = String(frameId?.matricNumber || \"\").trim();\n"
        "        const resolvedMatric = typeof resolved === \"object\" && resolved\n"
        "          ? String((resolved as { matric?: string }).matric || \"\").trim()\n"
        "          : \"\";\n"
        "        const matric = String(\n"
        "          a.students?.matric_number || a.students?.student_id || resolvedMatric || frameMatric || metaMatric || \"\",\n"
        "        ).trim() || \"\u2014\";\n"
        "        const _c = a.examinations?.courses as unknown;\n"
        "        const courseObj = Array.isArray(_c)\n"
        "          ? (_c[0] as { code?: string; name?: string } | undefined)\n"
        "          : (_c as { code?: string; name?: string } | null | undefined);\n"
        "        const metaCourse = (() => {\n"
        "          const mm = a.metadata;\n"
        "          if (!mm || typeof mm !== \"object\") return \"\";\n"
        "          const r = mm as Record<string, unknown>;\n"
        "          return String(r.courseCode || r.course_code || \"\").trim();\n"
        "        })();\n"
        "        const metaTitle = (() => {\n"
        "          const mm = a.metadata;\n"
        "          if (!mm || typeof mm !== \"object\") return \"\";\n"
        "          const r = mm as Record<string, unknown>;\n"
        "          return String(r.examTitle || r.exam_title || \"\").trim();\n"
        "        })();\n"
        "        const courseCode = String(\n"
        "          courseObj?.code || examEnrichQ.data?.[String(a.exam_id)]?.courseCode || frameId?.courseCode || metaCourse || \"\",\n"
        "        ).trim();\n"
        "        const courseName = String(courseObj?.name || examEnrichQ.data?.[String(a.exam_id)]?.courseName || \"\").trim();\n"
        "        const course = courseCode && courseName && courseName.toLowerCase() !== courseCode.toLowerCase()\n"
        "          ? `${courseCode} \u00b7 ${courseName}`\n"
        "          : (courseCode || courseName || \"\u2014\");\n"
        "        const title = String(\n"
        "          a.examinations?.title || examEnrichQ.data?.[String(a.exam_id)]?.title || frameId?.examTitle || metaTitle || \"\",\n"
        "        ).trim() || \"Exam\";\n"
        "        "
    )
    new_block = new_block.replace("\\u2014", "\u2014").replace("\\u00b7", "\u00b7")
    om = om[:start] + new_block + om[end:]
    print("OK: resolve")
else:
    print("FAIL: resolve", start, end)

om = om.replace(
    "if (!ids.length) return {} as Record<string, string>;\n      const map: Record<string, string> = {};",
    "if (!ids.length) return {} as Record<string, { name: string; matric: string }>;\n      const map: Record<string, { name: string; matric: string }> = {};",
)
om = om.replace(
    "if (name && name.toLowerCase() !== matric.toLowerCase()) map[row.id] = name;",
    "if (name || matric) map[row.id] = { name: name || \"\", matric };",
)
old_pf = """          if (!map[row.id] && row.profile_id && byPid[String(row.profile_id)]) {
            map[row.id] = byPid[String(row.profile_id)];
          }"""
new_pf = """          if (row.profile_id && byPid[String(row.profile_id)]) {
            const existing = map[row.id];
            if (!existing || !existing.name) {
              map[row.id] = { name: byPid[String(row.profile_id)], matric: existing?.matric || \"\" };
            }
          }"""
if old_pf in om:
    om = om.replace(old_pf, new_pf, 1)
    print("OK: profile fill")

if om != oo:
    OM.write_text(om)
    print("WRITTEN officer")
else:
    print("NO officer change")

cbt = CBT.read_text()
oc = cbt
cbt = cbt.replace(
    'getStudentName: () => String((student as { fullName?: string } | null)?.fullName || session?.fullName || "").trim() || null,',
    'getStudentName: () => String((student as { fullName?: string } | null)?.fullName || session?.fullName || session?.identifier || "").trim() || null,',
)
cbt = cbt.replace(
    'getMatricNumber: () => String((student as { matric?: string | null } | null)?.matric || "").trim() || null,',
    'getMatricNumber: () => String((student as { matric?: string | null; matricNumber?: string | null } | null)?.matric || (student as { matricNumber?: string | null } | null)?.matricNumber || session?.identifier || "").trim() || null,',
)
cbt = cbt.replace(
    'metadata: { studentName, matricNumber: String((student as { matricNumber?: string } | null)?.matricNumber || (student as { matric?: string } | null)?.matric || "").trim() || undefined, lastSeenAt: new Date().toISOString() },',
    'metadata: { studentName: studentName || session?.fullName || undefined, matricNumber: String((student as { matricNumber?: string } | null)?.matricNumber || (student as { matric?: string } | null)?.matric || session?.identifier || "").trim() || undefined, lastSeenAt: new Date().toISOString() },',
)
if cbt != oc:
    CBT.write_text(cbt)
    print("WRITTEN cbt")
else:
    print("NO cbt change")

print("ALL DONE")
