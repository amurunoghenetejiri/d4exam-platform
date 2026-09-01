#!/usr/bin/env python3
import runpy
from pathlib import Path
here = Path(__file__).resolve().parent
for name in ("apply_gate_gz.py", "apply_cbt_gz.py", "apply_officer_gz.py"):
    runpy.run_path(str(here / name), run_name="__main__")
print("all camera + officer live fixes applied")
