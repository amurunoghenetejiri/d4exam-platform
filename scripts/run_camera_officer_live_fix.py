#!/usr/bin/env python3
from pathlib import Path
import subprocess, sys
root = Path(__file__).resolve().parent
p1 = (root / "apply_camera_officer_live_fix.part1.txt").read_text()
p2 = (root / "apply_camera_officer_live_fix.part2.txt").read_text()
script = root / "apply_camera_officer_live_fix.py"
script.write_text(p1 + p2)
r = subprocess.run([sys.executable, str(script)], cwd=root.parent)
raise SystemExit(r.returncode)
