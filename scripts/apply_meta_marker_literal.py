#!/usr/bin/env python3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / "src/routes/teacher.examinations.tsx"
t = p.read_text()
changed = False

pairs = [
(
"""const metaBlob = `${META_MARKER}${JSON.stringify({ questionsToAnswer, assessmentKind })}`;
      const secBlob = `${SECURITY_MARKER}${JSON.stringify(sec)}`;""",
"""const metaBlob = `[[D4_EXAM_META]]${JSON.stringify({ questionsToAnswer, assessmentKind })}`;
      const secBlob = `[[D4_SECURITY_JSON]]${JSON.stringify(sec)}`;""",
),
(
"""const metaBlob = `${META_MARKER}${JSON.stringify({ ...meta, assessmentKind: meta.assessmentKind || \"examination\" })}`;
      const secBlob = `${SECURITY_MARKER}${JSON.stringify(sec)}`;""",
"""const metaBlob = `[[D4_EXAM_META]]${JSON.stringify({ ...meta, assessmentKind: meta.assessmentKind || \"examination\" })}`;
      const secBlob = `[[D4_SECURITY_JSON]]${JSON.stringify(sec)}`;""",
),
]
for a, b in pairs:
    if a in t:
        t = t.replace(a, b, 1)
        changed = True
        print("replaced block")

old_imp = """  toExamSettingsRow,
  META_MARKER,
  SECURITY_MARKER,
} from \"@/lib/exam-security\";"""
new_imp = """  toExamSettingsRow,
} from \"@/lib/exam-security\";"""
if old_imp in t:
    t = t.replace(old_imp, new_imp, 1)
    changed = True
    print("cleaned import")

p.write_text(t)
print("DONE" if changed else "NOOP", "META_MARKER left", t.count("META_MARKER"))
