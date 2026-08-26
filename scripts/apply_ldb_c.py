#!/usr/bin/env python3
from pathlib import Path
import json

p = Path("package.json")
data = json.loads(p.read_text())
data.setdefault("dependencies", {})["@capacitor-community/sqlite"] = "^8.1.1"
p.write_text(json.dumps(data, indent=2) + "\n")
print("package.json sqlite dep")

r = Path("src/routes/__root.tsx")
t = r.read_text()
if "LocalDbBootstrap" not in t:
    t = t.replace(
        'import { OfflineBootstrap } from "@/components/OfflineBootstrap";',
        'import { OfflineBootstrap } from "@/components/OfflineBootstrap";\nimport { LocalDbBootstrap } from "@/components/LocalDbBootstrap";',
        1,
    )
    t = t.replace("<OfflineBootstrap />", "<LocalDbBootstrap />\n      <OfflineBootstrap />", 1)
    r.write_text(t)
    print("root patched")
else:
    print("root already")
print("OK")
