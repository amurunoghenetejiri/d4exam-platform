from pathlib import Path
import base64
parts = [Path(f"scripts/cbt_restored_b64_{i}.txt").read_text().strip() for i in range(3)]
raw = base64.b64decode("".join(parts))
Path("src/components/cbt/CbtExamSession.impl.tsx").write_bytes(raw)
text = raw.decode()
assert "export function CbtExamPage" in text
assert "startScreenShareStream" in text
print("restored CBT", len(raw))
