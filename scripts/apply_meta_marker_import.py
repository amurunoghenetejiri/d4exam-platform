#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src/routes/teacher.examinations.tsx"
t = p.read_text()

old = """  stripInternalMarkers,
  toExamSettingsRow,
} from "@/lib/exam-security";"""

new = """  stripInternalMarkers,
  toExamSettingsRow,
  META_MARKER,
  SECURITY_MARKER,
} from "@/lib/exam-security";"""

if old in t:
    t = t.replace(old, new, 1)
    print("OK import")
elif "META_MARKER," in t and "SECURITY_MARKER," in t:
    print("already")
else:
    print("FAIL")
    i = t.find("toExamSettingsRow")
    print(repr(t[max(0, i - 20) : i + 60]))

p.write_text(t)
print("done")
