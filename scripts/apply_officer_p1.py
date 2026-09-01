#!/usr/bin/env python3
import base64, gzip
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PART1 = "SEE_NEXT"
(Path(__file__).resolve().parent / "_officer_b64_part1.txt").write_text(PART1)
print("part1 written", len(PART1))
