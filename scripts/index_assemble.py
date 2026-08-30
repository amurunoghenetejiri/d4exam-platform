#!/usr/bin/env python3
import base64, gzip, pathlib
root = pathlib.Path(__file__).resolve().parents[1]
parts = sorted(root.glob("scripts/index_part*.b64"))
b64 = "".join(p.read_text().strip() for p in parts)
rel = 'src/routes/student.index.tsx'
path = root / rel
path.parent.mkdir(parents=True, exist_ok=True)
path.write_bytes(gzip.decompress(base64.b64decode(b64)))
print("wrote", path, path.stat().st_size)
