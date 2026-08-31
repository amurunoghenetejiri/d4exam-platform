#!/usr/bin/env python3
import base64, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
PARTS = ROOT / "scripts" / "fixed_parts"
for line in (PARTS / "manifest.txt").read_text().strip().splitlines():
    name, n = line.split("|")
    n = int(n)
    b64 = "".join((PARTS / f"{name}.{i:02d}.b64").read_text().strip() for i in range(n))
    raw = base64.b64decode(b64)
    dest = ROOT / ("src/lib/notify.ts" if name.startswith("notify") else "src/components/pages/NotificationsPage.tsx")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    print("wrote", dest.relative_to(ROOT), len(raw))
print("OK")
