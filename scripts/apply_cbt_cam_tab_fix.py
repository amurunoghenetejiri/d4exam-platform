#!/usr/bin/env python3
"""Apply CBT camera recovery + timed tab-pause from base64 blobs."""
import base64
from pathlib import Path

MAP = {
  "scripts/blobs/live-video.ts.b64": "src/lib/live-video.ts",
  "scripts/blobs/CbtExamSession.impl.tsx.b64": "src/components/cbt/CbtExamSession.impl.tsx",
}
for src, dest in MAP.items():
    data = base64.b64decode(Path(src).read_text().strip())
    Path(dest).write_bytes(data)
    print("wrote", dest, len(data))

impl = Path("src/components/cbt/CbtExamSession.impl.tsx").read_text()
assert "reconnectCamera" in impl and "beginTimedPause" in impl and "Tab violations" in impl
assert "pause_duration_seconds" in impl
lv = Path("src/lib/live-video.ts").read_text()
assert "CHANNEL_ERROR" in lv
print("verify ok")
