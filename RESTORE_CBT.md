# Restore full exam session UI

The exam page currently shows a temporary stub because the full ~49KB `CbtExamSession.impl.tsx` cannot be uploaded reliably through the automation channel.

## One-line restore (run on your machine)

```bash
cd /path/to/d4exam-platform && \
git checkout aba52b2f09c488380fd1e36feb0374ab84db3c91 -- src/components/cbt/CbtExamSession.impl.tsx && \
python3 -c "
from pathlib import Path
p = Path('src/components/cbt/CbtExamSession.impl.tsx')
c = p.read_text()
c = c.replace(
  'enabled: started && !done && !previewMode && (Boolean(screenStream) || isNativeScreenShareActive()),',
  'enabled: started && !done && !previewMode,',
  1,
)
c = c.replace(
  'const already = isNativeScreenShareActive() || (await refreshNativeScreenShareState());',
  'const already = (await refreshNativeScreenShareState()) || isNativeScreenShareActive();',
  1,
)
p.write_text(c)
print('restored', len(c))
assert 'export function CbtExamPage' in c
" && \
git add src/components/cbt/CbtExamSession.impl.tsx && \
git commit -m 'fix: restore full CbtExamSession exam UI + screen-share publish' && \
git push origin main
```

After push, Vercel deploys the real exam UI again.

## Also required for phone chrome + screen share

Rebuild the Android APK so:
- System navigation bar is navy (`styles.xml` already set)
- MediaProjection permission + status-bar screen-share icon work

```bash
npm run cap:sync
# then build APK in Android Studio / gradle
```
