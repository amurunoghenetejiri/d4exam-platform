#!/usr/bin/env python3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / "src/routes/teacher.examinations.tsx"
t = p.read_text()
changed = False

a1 = "const metaBlob = `${META_MARKER}${JSON.stringify({ questionsToAnswer, assessmentKind })}`;\n      const secBlob = `${SECURITY_MARKER}${JSON.stringify(sec)}`;"
b1 = "const metaBlob = `[[D4_EXAM_META]]${JSON.stringify({ questionsToAnswer, assessmentKind })}`;\n      const secBlob = `[[D4_SECURITY_JSON]]${JSON.stringify(sec)}`;"
if a1 in t:
    t = t.replace(a1, b1, 1)
    changed = True
    print("A")

a2 = 'const metaBlob = `${META_MARKER}${JSON.stringify({ ...meta, assessmentKind: meta.assessmentKind || "examination" })}`;\n      const secBlob = `${SECURITY_MARKER}${JSON.stringify(sec)}`;'
b2 = 'const metaBlob = `[[D4_EXAM_META]]${JSON.stringify({ ...meta, assessmentKind: meta.assessmentKind || "examination" })}`;\n      const secBlob = `[[D4_SECURITY_JSON]]${JSON.stringify(sec)}`;'
if a2 in t:
    t = t.replace(a2, b2, 1)
    changed = True
    print("B")

old_imp = "  toExamSettingsRow,\n  META_MARKER,\n  SECURITY_MARKER,\n} from \"@/lib/exam-security\";"
new_imp = "  toExamSettingsRow,\n} from \"@/lib/exam-security\";"
if old_imp in t:
    t = t.replace(old_imp, new_imp, 1)
    changed = True
    print("import")

p.write_text(t)
print("DONE" if changed else "NOOP", t.count("META_MARKER"), t.count("[[D4_EXAM_META]]"))
