from pathlib import Path
import base64
parts = [Path(f"scripts/cbt_fix_b64_{i}.txt").read_text().strip() for i in range(4)]
raw = base64.b64decode("".join(parts))
Path("src/components/cbt/CbtExamSession.impl.tsx").write_bytes(raw)
text = raw.decode()
assert "restoreMediaAfterReturn" in text
assert "overflow-y-auto" in text
print("CBT fixed", len(raw))
