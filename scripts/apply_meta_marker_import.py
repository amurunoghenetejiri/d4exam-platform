#!/usr/bin/env python3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / "src/routes/teacher.examinations.tsx"
t = p.read_text()
old = """  stripInternalMarkers,
  toExamSettingsRow,
} from \"@/lib/exam-security\";"""
new = """  stripInternalMarkers,
  toExamSettingsRow,
  META_MARKER,
  SECURITY_MARKER,
} from \"@/lib/exam-security\";"""
# actual newlines
old = """  stripInternalMarkers,
  toExamSettingsRow,
} from \"@/lib/exam-security\";"""
"""
# fix
old = (
    "  stripInternalMarkers,\n"
    "  toExamSettingsRow,\n"
    "} from \"@/lib/exam-security\";"
)
new = (
    "  stripInternalMarkers,\n"
    "  toExamSettingsRow,\n"
    "  META_MARKER,\n"
    "  SECURITY_MARKER,\n"
    "} from \"@/lib/exam-security\";"
)
if old in t:
    t = t.replace(old, new, 1)
    print("OK import")
elif "META_MARKER," in t and "from \"@/lib/exam-security\"" in t:
    print("already")
else:
    # try without escapes
    old2 = """  stripInternalMarkers,
  toExamSettingsRow,
} from "@/lib/exam-security";"""
    new2 = """  stripInternalMarkers,
  toExamSettingsRow,
  META_MARKER,
  SECURITY_MARKER,
} from "@/lib/exam-security";"""
    if old2 in t:
        t = t.replace(old2, new2, 1)
        print("OK import2")
    else:
        print("FAIL")
        i = t.find("toExamSettingsRow")
        print(repr(t[i:i+80]))
p.write_text(t)
print("done")
