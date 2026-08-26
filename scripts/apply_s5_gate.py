#!/usr/bin/env python3
from pathlib import Path
p = Path("src/components/cbt/ExamSecurityGate.tsx")
t = p.read_text()
if "assertOnlineActionSync" in t:
    print("already gated")
else:
    if 'from "react"' in t:
        t = t.replace(
            'from "react"',
            'from "react";\nimport { assertOnlineActionSync } from "@/lib/offline-guard";\nimport { toast } from "sonner"',
            1,
        )
    if "void onStart({" in t:
        t = t.replace(
            "void onStart({",
            "{\n                const offlineMsg = assertOnlineActionSync();\n                if (offlineMsg) {\n                  toast.error(offlineMsg);\n                  return;\n                }\n              }\n              void onStart({",
            1,
        )
    p.write_text(t)
    print("patched ExamSecurityGate")
print("OK")
