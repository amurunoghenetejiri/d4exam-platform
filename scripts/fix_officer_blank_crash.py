#!/usr/bin/env python3
"""Fix ReferenceError: metaMatric is not defined in studentDisplayName (crashes officer live page)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OM = ROOT / "src/routes/officer.live-monitor.tsx"
om = OM.read_text()
orig = om

# Bug: patch accidentally put metaMatric into studentDisplayName top-level function
# where it is out of scope -> ReferenceError -> blank officer page
old = '  const matric = String(a.students?.matric_number || a.students?.student_id || metaMatric || "").trim();'
new = '  const matric = String(a.students?.matric_number || a.students?.student_id || "").trim();'
if old in om:
    om = om.replace(old, new, 1)
    print("OK: removed metaMatric from studentDisplayName")
else:
    print("SKIP: studentDisplayName already clean or different")

# Also ensure cards matric uses metaMatric (defined in that scope)
old_m = '        const matric = String(a.students?.matric_number || a.students?.student_id || "\u2014").trim() || "\u2014";'
# try with actual em dash
old_m2 = '        const matric = String(a.students?.matric_number || a.students?.student_id || "\u2014").trim() || "\u2014";'
# read actual dash from file context
if 'const metaMatric = (() => {' in om:
    # Find matric line after metaMatric that ignores it
    needle = 'const matric = String(a.students?.matric_number || a.students?.student_id ||'
    idx = om.find('const metaMatric = (() => {')
    if idx > 0:
        idx2 = om.find(needle, idx)
        if idx2 > 0 and 'metaMatric' not in om[idx2:idx2+120]:
            # replace first matric assignment after metaMatric
            end = om.find(';', idx2) + 1
            line = om[idx2:end]
            fixed = 'const matric = String(a.students?.matric_number || a.students?.student_id || metaMatric || "").trim() || "\u2014";'
            fixed = fixed.replace('\\u2014', '\u2014')
            om = om[:idx2] + fixed + om[end:]
            print("OK: cards matric uses metaMatric")
        else:
            print("SKIP: cards matric already uses metaMatric or not found")

if om != orig:
    OM.write_text(om)
    print("WRITTEN", OM)
else:
    print("NO CHANGE")
