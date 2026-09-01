#!/usr/bin/env python3
import runpy
from pathlib import Path
here = Path(__file__).resolve().parent
for name in ("scripts_apply_officer_surgical.py", "scripts_apply_cbt_surgical.py"):
    p = here / name
    if not p.exists():
        p = here / name.replace("scripts_", "")
    print("running", p)
    runpy.run_path(str(p), run_name="__main__")
print("DONE surgical officer+cbt")
