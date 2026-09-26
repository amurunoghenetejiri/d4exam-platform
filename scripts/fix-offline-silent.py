#!/usr/bin/env python3
from pathlib import Path
for path in ["src/routes/student.contact-officer.tsx", "src/routes/officer.reports.tsx"]:
    p = Path(path)
    if not p.exists():
        print("skip", path); continue
    t = p.read_text()
    old = '''      if (!isOnlineNow()) {
        toast.error("Internet connection is required to send messages.");
        return;
      }
'''
    if old in t:
        t = t.replace(old, "")
        print("removed offline gate", path)
    else:
        # variants
        import re
        t2, n = re.subn(
            r"\s*if \(!isOnlineNow\(\)\) \{\s*toast\.error\(\"Internet connection is required[^\"]*\"\);\s*return;\s*\}\s*",
            "\n",
            t,
        )
        if n:
            t = t2
            print("removed offline gate regex", path, n)
        else:
            print("no offline gate", path)
    p.write_text(t)
print("done")
