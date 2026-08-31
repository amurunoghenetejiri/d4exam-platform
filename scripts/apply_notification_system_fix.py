#!/usr/bin/env python3
"""Apply notification system fix (single template path + real names + full message UI)."""
import base64, gzip, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
BLOB = ROOT / "scripts" / "blobs_notify"
manifest = (BLOB / "manifest.txt").read_text().strip().splitlines()
for line in manifest:
    rel, safe, n = line.split("|")
    n = int(n)
    b64 = "".join((BLOB / f"part_{safe}_{i:02d}.b64").read_text().strip() for i in range(n))
    raw = gzip.decompress(base64.b64decode(b64))
    dest = ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    print("wrote", rel, len(raw))
print("OK")
