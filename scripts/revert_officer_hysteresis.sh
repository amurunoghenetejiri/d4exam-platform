#!/usr/bin/env bash
set -euo pipefail
# Restore files from commit before hysteresis batch
REF=9ae6d57a36d94559d6dbe8ebf1e3fc2a8a2256ff
git fetch origin "$REF" --depth=1 2>/dev/null || true
git show "$REF:src/lib/live-video.ts" > src/lib/live-video.ts
git show "$REF:src/routes/officer.live-monitor.tsx" > src/routes/officer.live-monitor.tsx
echo "Restored live-video.ts and officer.live-monitor.tsx from $REF"
