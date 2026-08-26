#!/usr/bin/env python3
import base64, json
from pathlib import Path
ROOT = Path("scripts/ldb_parts")
for item in json.loads(Path("scripts/ldb_manifest.json").read_text()):
    data = base64.b64decode("".join((ROOT / f"{item['safe']}.{i}.b64").read_text() for i in range(item["parts"])))
    p = Path(item["path"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    print("wrote", item["path"], len(data))
print("OK")
