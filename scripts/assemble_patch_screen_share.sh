#!/usr/bin/env bash
set -euo pipefail
cat scripts/_pss_p1.txt scripts/_pss_p2.txt > scripts/patch_screen_share.py
python3 scripts/patch_screen_share.py
