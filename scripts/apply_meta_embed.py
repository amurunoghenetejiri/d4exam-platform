#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
p = ROOT / "src/routes/teacher.examinations.tsx"
t = p.read_text()
if "META_MARKER" not in t:
    t = t.replace(
        "stripInternalMarkers, toExamSettingsRow, loadTeacherSecurityDefaults",
        "stripInternalMarkers, toExamSettingsRow, loadTeacherSecurityDefaults, META_MARKER, SECURITY_MARKER",
    )
    print("OK import")
old = (
    "      const plain = stripInternalMarkers(description.trim() || \"\");\n"
    "      let desc: string | null = plain || null;\n"
    "      const sec = normalizeSecuritySettings(security);\n"
    "      desc = embedExamMeta(desc, { questionsToAnswer, assessmentKind });\n"
    "      desc = embedSecurityInDescription(desc, sec);"
)
new = (
    "      const plain = stripInternalMarkers(description.trim() || \"\");\n"
    "      const sec = normalizeSecuritySettings(security);\n"
    "      const metaBlob = `${META_MARKER}${JSON.stringify({ questionsToAnswer, assessmentKind })}`;\n"
    "      const secBlob = `${SECURITY_MARKER}${JSON.stringify(sec)}`;\n"
    "      let desc: string | null = [plain, metaBlob, secBlob].filter(Boolean).join(\"\\n\") || null;"
)
if old in t:
    t = t.replace(old, new, 1)
    print("OK persist")
else:
    print("FAIL persist")
old2 = (
    "      let desc = row?.description ?? null;\n"
    "      const meta = parseExamMeta(desc);\n"
    "      const sec = normalizeSecuritySettings(\n"
    "        parseSecurityFromDescription(desc) ?? loadTeacherSecurityDefaults(teacher.teacherId),\n"
    "      );\n"
    "      const plain = stripInternalMarkers(desc);\n"
    "      desc = embedExamMeta(plain, { ...meta, assessmentKind: meta.assessmentKind || \"examination\" });\n"
    "      desc = embedSecurityInDescription(desc, sec);"
)
new2 = (
    "      let desc = row?.description ?? null;\n"
    "      const meta = parseExamMeta(desc);\n"
    "      const sec = normalizeSecuritySettings(\n"
    "        parseSecurityFromDescription(desc) ?? loadTeacherSecurityDefaults(teacher.teacherId),\n"
    "      );\n"
    "      const plain = stripInternalMarkers(desc);\n"
    "      const metaBlob = `${META_MARKER}${JSON.stringify({ ...meta, assessmentKind: meta.assessmentKind || \"examination\" })}`;\n"
    "      const secBlob = `${SECURITY_MARKER}${JSON.stringify(sec)}`;\n"
    "      desc = [plain, metaBlob, secBlob].filter(Boolean).join(\"\\n\") || null;"
)
if old2 in t:
    t = t.replace(old2, new2, 1)
    print("OK submit")
else:
    print("FAIL submit")
p.write_text(t)
print("DONE", t.count("{") - t.count("}"))
