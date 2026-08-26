#!/usr/bin/env python3
import base64, json
from pathlib import Path
ROOT = Path("scripts/notif_parts")
manifest = json.loads(Path("scripts/notif_manifest.json").read_text())
for item in manifest:
    chunks = []
    for i in range(item["parts"]):
        chunks.append((ROOT / f"{item['safe']}.{i}.b64").read_text())
    data = base64.b64decode("".join(chunks))
    p = Path(item["path"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    print("wrote", item["path"], len(data))
print("OK")
