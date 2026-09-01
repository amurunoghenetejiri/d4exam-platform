#!/usr/bin/env python3
from pathlib import Path
p = Path("src/routes/officer.live-monitor.tsx")
t = p.read_text()

idx = t.find('queryKey: ["officer-live-attempts"')
if idx < 0:
    raise SystemExit('attempts query not found')
marker = 'const selects = ['
sel = t.find(marker, idx)
if sel < 0:
    raise SystemExit('selects not found')
if '`id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata`,' not in t[sel:sel+500]:
    insert_at = sel + len(marker)
    addition = '\n        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata`,'
    t = t[:insert_at] + addition + t[insert_at:]
    print('added minimal select first')
else:
    print('minimal select already first')

old_merge = (
    "    const inProgress = attemptsQ.data ?? [];\n"
    "    const recentDone = recentDoneQ.data ?? [];\n"
    "    const merged = [...inProgress, ...recentDone];"
)
new_merge = (
    "    const inProgress = attemptsQ.data ?? [];\n"
    "    const recentDone = recentDoneQ.data ?? [];\n"
    "    const knownIds = new Set([...inProgress, ...recentDone].map((a) => a.id));\n"
    "    const frameOnly: AttemptRow[] = [];\n"
    "    for (const [key, entry] of Object.entries(frames)) {\n"
    "      if (key.startsWith(\"student:\")) continue;\n"
    "      if (knownIds.has(key)) continue;\n"
    "      if (!entry?.src || !entry.ts) continue;\n"
    "      if (now - entry.ts > 60_000) continue;\n"
    "      frameOnly.push({\n"
    "        id: key,\n"
    "        exam_id: \"\",\n"
    "        student_id: key,\n"
    "        status: \"in_progress\",\n"
    "        started_at: new Date(entry.ts).toISOString(),\n"
    "        updated_at: new Date(entry.ts).toISOString(),\n"
    "        tab_switch_count: 0,\n"
    "        metadata: { lastSeenAt: new Date(entry.ts).toISOString() },\n"
    "        examinations: null,\n"
    "        students: null,\n"
    "      });\n"
    "    }\n"
    "    const merged = [...inProgress, ...recentDone, ...frameOnly];"
)
if "frameOnly" not in t and old_merge in t:
    t = t.replace(old_merge, new_merge, 1)
    print('frameOnly added')
elif "frameOnly" in t:
    print('frameOnly present')
else:
    print('WARN merge not found')

old_f = (
    "        if (c.sev === \"offline\") {\n"
    "          if (c.activity == null) return false;\n"
    "          return now - c.activity <= OFFLINE_HIDE_MS;\n"
    "        }"
)
new_f = (
    "        if (c.sev === \"offline\") {\n"
    "          if (c.activity == null) return true;\n"
    "          return now - c.activity <= Math.max(OFFLINE_HIDE_MS, 45 * 60 * 1000);\n"
    "        }"
)
if old_f in t:
    t = t.replace(old_f, new_f, 1)
    print('offline filter updated')
elif "45 * 60 * 1000" in t:
    print('offline filter already updated')
else:
    print('WARN offline filter not found')

p.write_text(t)
print('monitor ok', len(t))
