#!/usr/bin/env python3
from pathlib import Path
code = "".join(Path(f"scripts/_cam_tab_part{i}.py").read_text() for i in range(3))
if code.startswith("#!"):
    code = code.split("\n", 1)[1]
exec(compile(code, "apply_cbt_cam_tab_fix.py", "exec"))
