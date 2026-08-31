#!/usr/bin/env python3
import base64, gzip, pathlib, subprocess, os
ROOT = pathlib.Path(__file__).resolve().parents[1]
PARTS = ROOT / "scripts" / "fixed_parts"
os.chdir(ROOT)
for line in (PARTS/"manifest.txt").read_text().strip().splitlines():
    name, n = line.split("|")
    n = int(n)
    b64 = "".join((PARTS/f"{name}.{i:02d}.b64").read_text().strip() for i in range(n))
    raw = gzip.decompress(base64.b64decode(b64))
    diff_path = PARTS / name
    text = raw.decode("utf-8", errors="replace")
    text = text.replace("--- /tmp/orig_notify.ts", "--- a/src/lib/notify.ts")
    text = text.replace("+++ src/lib/notify.ts", "+++ b/src/lib/notify.ts")
    text = text.replace("--- /tmp/orig_page.tsx", "--- a/src/components/pages/NotificationsPage.tsx")
    text = text.replace("+++ src/components/pages/NotificationsPage.tsx", "+++ b/src/components/pages/NotificationsPage.tsx")
    diff_path.write_text(text)
    r = subprocess.run(["patch", "-p1", "--forward", "--reject-file=-", "-i", str(diff_path)], capture_output=True, text=True)
    print(name, "rc", r.returncode)
    print(r.stdout)
    if r.returncode not in (0, 1):
        print(r.stderr)
        raise SystemExit(r.returncode)
print("OK")
