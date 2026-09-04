#!/usr/bin/env python3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / "src/routes/teacher.examinations.tsx"
t = p.read_text()
if "META_MARKER, SECURITY_MARKER" not in t:
    t = t.replace(
        "stripInternalMarkers, toExamSettingsRow, loadTeacherSecurityDefaults",
        "stripInternalMarkers, toExamSettingsRow, loadTeacherSecurityDefaults, META_MARKER, SECURITY_MARKER",
    )
    print("import")
a = "desc = embedExamMeta(desc, { questionsToAnswer, assessmentKind });\n      desc = embedSecurityInDescription(desc, sec);"
b = "const metaBlob = `${META_MARKER}${JSON.stringify({ questionsToAnswer, assessmentKind })}`;\n      const secBlob = `${SECURITY_MARKER}${JSON.stringify(sec)}`;\n      desc = [plain, metaBlob, secBlob].filter(Boolean).join(\"\\n\") || null;"
if a in t:
    t = t.replace(a, b, 1)
    print("A")
else:
    print("A miss")
a2 = 'desc = embedExamMeta(plain, { ...meta, assessmentKind: meta.assessmentKind || "examination" });\n      desc = embedSecurityInDescription(desc, sec);'
b2 = 'const metaBlob = `${META_MARKER}${JSON.stringify({ ...meta, assessmentKind: meta.assessmentKind || "examination" })}`;\n      const secBlob = `${SECURITY_MARKER}${JSON.stringify(sec)}`;\n      desc = [plain, metaBlob, secBlob].filter(Boolean).join("\\n") || null;'
if a2 in t:
    t = t.replace(a2, b2, 1)
    print("B")
else:
    print("B miss")
p.write_text(t)
print("done", t.count("{") - t.count("}"))
