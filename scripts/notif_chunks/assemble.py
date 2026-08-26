#!/usr/bin/env python3
import base64, json
from pathlib import Path
root = Path("scripts/notif_chunks")
manifest = json.loads((root / "manifest.json").read_text())
for item in manifest:
    parts = []
    for i in range(item["parts"]):
        parts.append((root / f"{item['safe']}__{i}.txt").read_text())
    data = base64.b64decode("".join(parts))
    p = Path(item["path"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    print("wrote", item["path"], len(data))
print("OK")
