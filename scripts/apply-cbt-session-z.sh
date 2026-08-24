#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZDIR="$ROOT/scripts/cbt-session-z"
OUT="$ROOT/src/components/cbt/CbtExamSession.impl.tsx"
TMP=$(mktemp)
# Concatenate p0..p5 in order
: > "$TMP.b64"
for i in 0 1 2 3 4 5; do
  cat "$ZDIR/p${i}.txt" >> "$TMP.b64"
done
python3 - << PY
import base64, zlib
from pathlib import Path
b64 = Path("$TMP.b64").read_text().replace("\n", "").strip()
raw = zlib.decompress(base64.b64decode(b64))
text = raw.decode("utf-8")
assert "enterExamImmersive" in text
assert "question_order" in text
Path("$OUT").write_bytes(raw)
print("installed", len(raw), "bytes")
PY
rm -f "$TMP" "$TMP.b64"
