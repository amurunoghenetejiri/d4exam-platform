#!/usr/bin/env python3
import runpy
from pathlib import Path
here = Path(__file__).resolve().parent
for name in ("apply_officer_live_push.py", "apply_cbt_live_push.py"):
    p = here / name
    print("running", p.name)
    runpy.run_path(str(p), run_name="__main__")
print("DONE: officer + cbt live fixes applied")
