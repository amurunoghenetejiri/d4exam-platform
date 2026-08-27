#!/usr/bin/env python3
from pathlib import Path
ROOT = Path('.')
gate = ROOT / 'src/components/cbt/ExamSecurityGate.tsx'
g = gate.read_text()
if 'stopScreenShareStream(share.stream)' in g:
    g = g.replace('            stopScreenShareStream(share.stream);\n            setScreenGranted(true);', '            // Keep MediaProjection active for exam reuse\n            setScreenGranted(true);', 1)
    g = g.replace('import { canAttemptScreenShare, startScreenShareStream, stopScreenShareStream } from "@/lib/screen-share";', 'import { canAttemptScreenShare, startScreenShareStream } from "@/lib/screen-share";')
    gate.write_text(g)
    print('gate ok')
else:
    print('gate skip')
sess = ROOT / 'src/components/cbt/CbtExamSession.impl.tsx'
s = sess.read_text()
if 'isNativeScreenShareActive' not in s:
    s = s.replace('import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream } from "@/lib/screen-share";', 'import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream, isNativeScreenShareActive, getActiveScreenStream } from "@/lib/screen-share";')
    s = s.replace('          const share = await startScreenShareStream();\n          if (share.ok) {\n            stopScreenShareStream(screenStreamRef.current);\n            screenStreamRef.current = share.stream;', '          const existing = screenStreamRef.current || getActiveScreenStream();\n          const share = (isNativeScreenShareActive() && existing) ? { ok: true as const, stream: existing } : await startScreenShareStream();\n          if (share.ok) {\n            screenStreamRef.current = share.stream;', 1)
    s = s.replace('enabled: started && !done && !previewMode && !paused && Boolean(screenStream),', 'enabled: started && !done && !previewMode && !paused && (Boolean(screenStream) || isNativeScreenShareActive()),', 1)
    s = s.replace('getStream: () => screenStreamRef.current || screenStream,', 'getStream: () => screenStreamRef.current || screenStream || getActiveScreenStream(),', 1)
    sess.write_text(s)
    print('session ok')
else:
    print('session skip')
lv = ROOT / 'src/lib/live-video.ts'
lv_t = lv.read_text()
old = '      if (!frame) {\n        const stream = opts.getStream();\n        if (!stream) return;\n        frame = await captureJpegFromStream(stream, {\n          maxWidth: 720,\n          quality: 0.55,\n          mirror: false,\n        });\n      }'
new = '      if (!frame) {\n        const stream = opts.getStream();\n        if (stream) {\n          frame = await captureJpegFromStream(stream, {\n            maxWidth: 720,\n            quality: 0.55,\n            mirror: false,\n          });\n        }\n      }'
if old in lv_t:
    lv.write_text(lv_t.replace(old, new, 1))
    print('live-video ok')
else:
    print('live-video skip')
print('ALL_OK')
