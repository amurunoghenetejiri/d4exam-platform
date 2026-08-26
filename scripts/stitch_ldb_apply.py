#!/usr/bin/env python3
from pathlib import Path

def stitch(prefix, out_name, n):
    parts = []
    for i in range(n):
        p = Path(f"scripts/ldb_apply_chunks/{prefix}.{i}.txt")
        if not p.exists():
            raise SystemExit(f"missing {p}")
        parts.append(p.read_text())
    Path(out_name).write_text("".join(parts))
    print("stitched", out_name, sum(len(x) for x in parts))

stitch("p1", "scripts/apply_ldb_p1.py", 5)
stitch("p2", "scripts/apply_ldb_p2.py", 3)
print("OK")
