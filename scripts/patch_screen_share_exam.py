#!/usr/bin/env python3
"""Surgical patches for screen-share crash + hold until submit."""
from pathlib import Path

# --- CbtExamSession.impl.tsx ---
p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
changed = False

if "holdExamScreenShare" not in t.split("from \"@/lib/screen-share\"")[0][-200:] and 'holdExamScreenShare } from "@/lib/screen-share"' not in t:
    t2 = t.replace(
        'import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream } from "@/lib/screen-share";',
        'import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream, holdExamScreenShare } from "@/lib/screen-share";',
    )
    if t2 != t:
        t = t2
        changed = True

old_shutdown = '''  const shutdownMedia = useCallback(() => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);'''

new_shutdown = '''  const shutdownMedia = useCallback(() => {
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { holdExamScreenShare(false); } catch { /* ignore */ }
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);'''

if old_shutdown in t:
    t = t.replace(old_shutdown, new_shutdown, 1)
    changed = True
elif "holdExamScreenShare(false)" not in t:
    t = t.replace(
        "try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }",
        "try { holdExamScreenShare(false); } catch { /* ignore */ }\n    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }",
        1,
    )
    changed = True

old_need = '''      if (needScreen) {
        const share = await startScreenShareStream();
        if (!share.ok) {
          toast.error(share.message || "Screen sharing is required for this examination.");
          return;
        }
        try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
        screenStreamRef.current = share.stream;
        setScreenStream(share.stream);
        onScreenShareEnded(share.stream, () => {
          toast.error("Screen sharing stopped. Re-enable to continue the exam.");
          setPaused(true);
          setPauseReason("Screen sharing stopped");
          setScreenStream(null);
          screenStreamRef.current = null;
        });
        toast.success("Screen sharing active");
      }'''

new_need = '''      if (needScreen) {
        let share;
        try {
          share = await startScreenShareStream();
        } catch (e) {
          console.warn("[exam] screen share threw", e);
          toast.error("Screen sharing failed. Try again.");
          return;
        }
        if (!share?.ok) {
          toast.error(share?.message || "Screen sharing is required for this examination.");
          return;
        }
        holdExamScreenShare(true);
        screenStreamRef.current = share.stream;
        setScreenStream(share.stream);
        onScreenShareEnded(share.stream, () => {
          try {
            toast.error("Screen sharing stopped. Re-enable to continue the exam.");
            setPaused(true);
            setPauseReason("Screen sharing stopped");
            setScreenStream(null);
            screenStreamRef.current = null;
          } catch { /* ignore */ }
        });
        toast.success("Screen sharing active");
      }'''

if old_need in t:
    t = t.replace(old_need, new_need, 1)
    changed = True
elif "holdExamScreenShare(true)" not in t or "stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }\n        screenStreamRef.current = share.stream" in t:
    # already partially patched on local - ensure hold true after ok
    if "holdExamScreenShare(true)" not in t:
        t = t.replace(
            "if (!share.ok) {",
            "if (!share?.ok) {",
            1,
        )

if changed:
    p.write_text(t)
    print("CbtExamSession patched")
else:
    print("CbtExamSession no change or already patched")

# --- screen-share.ts outer safety ---
sp = Path("src/lib/screen-share.ts")
st = sp.read_text()
if "startScreenShareStreamInner" not in st:
    st = st.replace(
        "export async function startScreenShareStream(): Promise<ScreenShareStartResult> {",
        '''export async function startScreenShareStream(): Promise<ScreenShareStartResult> {
  try {
    return await startScreenShareStreamInner();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[screen-share] startScreenShareStream outer catch", msg);
    status = "error";
    return {
      ok: false,
      reason: /denied|cancel|permission/i.test(msg) ? "denied" : "error",
      message: msg || "Screen share could not start. You can continue if screen share is optional.",
    };
  }
}

async function startScreenShareStreamInner(): Promise<ScreenShareStartResult> {''',
        1,
    )
    sp.write_text(st)
    print("screen-share wrapped")
else:
    print("screen-share already wrapped")

# --- root splash key ---
r = Path("src/routes/__root.tsx")
rt = r.read_text()
if "d4exam_splash_shown_v5" in rt:
    r.write_text(rt.replace("d4exam_splash_shown_v5", "d4exam_splash_shown_v6"))
    print("root splash key v6")
else:
    print("root key ok")

print("OK")
