#!/usr/bin/env python3
"""Apply live monitor + CBT attemptId/heartbeat fix from gzip+base64 chunks."""
from __future__ import annotations
import base64, gzip, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = Path(__file__).resolve().parent / "fixed_parts_live_video"
MANIFEST = PARTS / "manifest.txt"

def main() -> int:
    if not MANIFEST.exists():
        print("no manifest; skip")
        return 0
    by_path: dict[str, list[tuple[int, str]]] = {}
    for line in MANIFEST.read_text().splitlines():
        if not line.strip() or "|" not in line:
            continue
        path, idx, name = line.strip().split("|", 2)
        by_path.setdefault(path, []).append((int(idx), name))
    for path, items in by_path.items():
        items.sort()
        b64 = "".join((PARTS / name).read_text().strip() for _, name in items)
        raw = gzip.decompress(base64.b64decode(b64))
        out = ROOT / path
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(raw)
        print("wrote", path, len(raw))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
