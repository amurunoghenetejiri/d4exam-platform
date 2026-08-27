"""Patch ExamCameraPip face detection loop for reliability."""
from pathlib import Path
import re

p = Path("src/components/cbt/ExamCameraPip.tsx")
t = p.read_text()
assert "export function ExamCameraPip" in t

# Labels
t = t.replace('? "Multiple faces detected"', '? "Multiple Faces Detected"')
t = t.replace('? "No face detected"', '? "No Face Detected"')
t = t.replace('? "1 face monitoring"', '? "1 Face Monitoring"')

# Replace the face-detection effect body if still old-style (engine null stays unclear forever)
OLD_ENGINE_FAIL = """        if (!engine) {
          setFaceStatus("unclear");
          return;
        }
        faceEngineRef.current = engine;
        void tick();
"""
NEW_ENGINE_FAIL = """        if (!engine) {
          // Engine failed — do not stay stuck forever on "Detecting face"
          setFaceStatus("unavailable");
          lastStateRef.current = "unavailable";
          onSecRef.current?.({
            kind: "camera_blocked",
            faceCount: null,
            at: new Date().toISOString(),
          });
          return;
        }
        faceEngineRef.current = engine;
        void tick();
"""
if OLD_ENGINE_FAIL in t:
    t = t.replace(OLD_ENGINE_FAIL, NEW_ENGINE_FAIL, 1)
    print("engine fail path updated")

OLD_TICK = """    const tick = async () => {
      if (cancelled || !videoRef.current || !faceEngineRef.current) return;
      try {
        const n = await faceEngineRef.current.count(videoRef.current);
        if (cancelled) return;
        if (n == null) {
          applyState("unclear", null);
        } else if (n <= 0) {
          applyState("none", 0);
        } else if (n > 1) {
          applyState("multi", n);
        } else {
          applyState("ok", 1);
        }
      } catch {
        if (!cancelled) applyState("unclear", null);
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), 200);
    };
"""
NEW_TICK = """    let nullStreak = 0;
    const startedAt = Date.now();

    const waitVideoReady = async (maxMs = 2500) => {
      const t0 = Date.now();
      while (!cancelled && Date.now() - t0 < maxMs) {
        const v = videoRef.current;
        if (v && v.readyState >= 2 && v.videoWidth >= 16) {
          try {
            if (v.paused) await v.play();
          } catch {
            /* ignore */
          }
          return true;
        }
        await new Promise((r) => window.setTimeout(r, 80));
      }
      return Boolean(videoRef.current && videoRef.current.readyState >= 2);
    };

    const tick = async () => {
      if (cancelled || !videoRef.current || !faceEngineRef.current) return;
      try {
        const v = videoRef.current;
        if (v.readyState < 2 || v.videoWidth < 16) {
          if (Date.now() - startedAt > 1200) {
            nullStreak += 1;
            if (nullStreak >= 8) applyState("none", 0);
          }
        } else {
          const n = await faceEngineRef.current.count(v);
          if (cancelled) return;
          if (n == null) {
            nullStreak += 1;
            if (Date.now() - startedAt > 1500 && nullStreak >= 5) {
              applyState("none", 0);
            } else if (nullStreak >= 12) {
              applyState("unclear", null);
            }
          } else {
            nullStreak = 0;
            if (n <= 0) applyState("none", 0);
            else if (n > 1) applyState("multi", n);
            else applyState("ok", 1);
          }
        }
      } catch {
        if (!cancelled) {
          nullStreak += 1;
          if (nullStreak >= 10) applyState("unclear", null);
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), 250);
    };
"""
if OLD_TICK in t:
    t = t.replace(OLD_TICK, NEW_TICK, 1)
    print("tick updated")
elif "nullStreak" in t:
    print("tick already patched")
else:
    print("tick pattern missing — file may already be new")

OLD_INIT = """    void (async () => {
      try {
        const engine = await createFaceEngine();
        if (cancelled) {
          engine?.close();
          return;
        }
"""
NEW_INIT = """    void (async () => {
      try {
        await waitVideoReady(2500);
        if (cancelled) return;
        let engine: FaceEngine | null = null;
        for (let i = 0; i < 3 && !cancelled; i++) {
          engine = await createFaceEngine();
          if (engine) break;
          await new Promise((r) => window.setTimeout(r, 500 * (i + 1)));
        }
        if (cancelled) {
          engine?.close();
          return;
        }
"""
if OLD_INIT in t:
    t = t.replace(OLD_INIT, NEW_INIT, 1)
    print("init updated")
elif "waitVideoReady" in t:
    print("init already has waitVideoReady")
else:
    print("init pattern missing")

p.write_text(t)
print("ExamCameraPip final", "waitVideoReady" in t, "1 Face Monitoring" in t or "1 face monitoring" in t)
