from pathlib import Path
import base64
a = Path("scripts/monitor_b64_a.txt").read_text().strip()
b = Path("scripts/monitor_b64_b.txt").read_text().strip()
Path("src/routes/officer.live-monitor.tsx").write_bytes(base64.b64decode(a + b))
print("wrote", Path("src/routes/officer.live-monitor.tsx").stat().st_size)
