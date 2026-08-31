#!/usr/bin/env python3
"""Surgical CBT fixes: face detection retry, tab badge position, timer+live during pause."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch_pip(text: str) -> str:
    # 1) Initial faceStatus when faceDetection is on
    text = text.replace(
        'const [faceStatus, setFaceStatus] = useState<FaceState>("unavailable");',
        'const [faceStatus, setFaceStatus] = useState<FaceState>(faceDetection ? "unclear" : "unavailable");',
    )
    # 2) Replace permanent engine-fail block with continuous retry bootEngine
    old_boot = '''    void (async () => {
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
        if (!engine) {
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
      } catch {
        setFaceStatus("unclear");
      }
    })();'''
    new_boot = '''    const bootEngine = async () => {
      try {
        await waitVideoReady(3000);
        if (cancelled) return;
        try { faceEngineRef.current?.close?.(); } catch { /* ignore */ }
        faceEngineRef.current = null;
        let engine: FaceEngine | null = null;
        for (let i = 0; i < 3 && !cancelled; i++) {
          engine = await createFaceEngine();
          if (engine) break;
          await new Promise((r) => window.setTimeout(r, 600 * (i + 1)));
        }
        if (cancelled) {
          engine?.close();
          return;
        }
        if (!engine) {
          // Keep retrying — never stick on permanent "Face check off"
          setFaceStatus("unclear");
          lastStateRef.current = "unclear";
          if (!cancelled) {
            timer = window.setTimeout(() => {
              if (!cancelled) void bootEngine();
            }, 3000);
          }
          return;
        }
        faceEngineRef.current = engine;
        nullStreak = 0;
        setFaceStatus((s) => (s === "unavailable" || s === "unclear" ? "unclear" : s));
        void tick();
      } catch {
        setFaceStatus("unclear");
        if (!cancelled) {
          timer = window.setTimeout(() => {
            if (!cancelled) void bootEngine();
          }, 3000);
        }
      }
    };

    void bootEngine();'''
    if old_boot not in text:
        # already patched or different base
        if "Keep retrying — never stick on permanent" in text:
            print("ExamCameraPip: bootEngine already patched")
        else:
            raise SystemExit("ExamCameraPip: boot block not found")
    else:
        text = text.replace(old_boot, new_boot)
        print("ExamCameraPip: bootEngine continuous retry applied")

    # 3) Label: Face check off -> Detecting face… + respect !faceDetection
    old_label = '''  const faceLabel =
    camConn === "reconnecting"
      ? "Reconnecting camera…"
      : camConn === "unavailable"
        ? "Camera not available"
        : faceStatus === "multi"
          ? "Multiple Faces Detected"
          : faceStatus === "none"
            ? "No Face Detected"
            : faceStatus === "ok"
              ? "1 Face Monitoring"
              : faceStatus === "unavailable"
                ? camConn === "active"
                  ? "Face check off"
                  : "Camera blocked"
                : "Detecting face";'''
    new_label = '''  const faceLabel =
    camConn === "reconnecting"
      ? "Reconnecting camera…"
      : camConn === "unavailable"
        ? "Camera not available"
        : !faceDetection
          ? "Camera active"
          : faceStatus === "multi"
            ? "Multiple Faces Detected"
            : faceStatus === "none"
              ? "No Face Detected"
              : faceStatus === "ok"
                ? "1 Face Monitoring"
                : faceStatus === "unavailable"
                  ? camConn === "active"
                    ? "Detecting face…"
                    : "Camera blocked"
                  : "Detecting face…";'''
    if "Face check off" in text:
        if old_label not in text:
            # try softer replace
            text = text.replace('? "Face check off"', '? "Detecting face…"')
            text = text.replace(': "Detecting face";', ': "Detecting face…";')
            print("ExamCameraPip: label soft-replaced Face check off")
        else:
            text = text.replace(old_label, new_label)
            print("ExamCameraPip: faceLabel updated")
    else:
        print("ExamCameraPip: Face check off already gone")
    return text


def patch_cbt(text: str) -> str:
    # Timer keeps running during pause
    text2 = text.replace(
        "if (!started || done || seconds == null || paused) return;",
        "// Timer keeps running during integrity pause — time loss is the consequence\n"
        "    if (!started || done || seconds == null) return;",
    )
    if text2 == text and "Timer keeps running during integrity pause" not in text:
        raise SystemExit("CbtExamSession: timer condition not found")
    text = text2
    text = text.replace(
        "}, [started, done, paused, seconds === 0]);",
        "}, [started, done, seconds === 0]);",
    )
    # Live publish continues during pause (officer sees live)
    text = text.replace(
        "enabled: started && !done && !previewMode && !paused && Boolean(security.requireCamera),",
        "enabled: started && !done && !previewMode && Boolean(security.requireCamera),",
    )
    text = text.replace(
        "enabled: started && !done && !previewMode && !paused && Boolean(screenStream),",
        "enabled: started && !done && !previewMode && Boolean(screenStream),",
    )
    # Tab badge bottom-right
    text = text.replace(
        'className="pointer-events-none fixed inset-x-0 bottom-3 z-[120] flex justify-center px-3"',
        'className="pointer-events-none fixed bottom-3 right-3 z-[120] sm:bottom-4 sm:right-4"',
    )
    # Camera reconnect hook
    text = text.replace(
        "onNeedReconnect={() => {}}",
        "onNeedReconnect={() => { void reconnectCamera(); }}",
    )
    # face status ref for live (optional additive)
    if "faceStatusForLiveRef" not in text:
        text = text.replace(
            "const pausedRef = useRef(false);",
            "const pausedRef = useRef(false);\n  const faceStatusForLiveRef = useRef<string>(\"ok\");",
        )
        if "getFaceStatus:" not in text:
            text = text.replace(
                "getStream: () => mediaStreamRef.current || liveStream,",
                "getStream: () => mediaStreamRef.current || liveStream,\n"
                "    getFaceStatus: () => faceStatusForLiveRef.current,\n"
                "    getAnsweredCount: () => Object.keys(answers).length,\n"
                "    getTotalQuestions: () => questions.length,\n"
                "    getTimeRemainingSec: () => seconds,",
            )
        text = text.replace(
            "const onFaceSecurityEvent = useCallback((ev: FaceSecurityEvent) => {",
            "const onFaceSecurityEvent = useCallback((ev: FaceSecurityEvent) => {\n"
            "    faceStatusForLiveRef.current = ev.kind === \"ok\" ? \"ok\" : ev.kind;",
        )
    print("CbtExamSession: timer/live/tab/reconnect patches applied")
    return text


def main():
    pip = ROOT / "src/components/cbt/ExamCameraPip.tsx"
    cbt = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"
    for p in (pip, cbt):
        if not p.exists() or p.read_text().strip() == "PLACEHOLDER":
            raise SystemExit(f"Missing or PLACEHOLDER: {p}")
    pip.write_text(patch_pip(pip.read_text()))
    cbt.write_text(patch_cbt(cbt.read_text()))
    # Verify markers
    pip_t = pip.read_text()
    cbt_t = cbt.read_text()
    assert "Face check off" not in pip_t or "never stick on permanent" in pip_t
    assert "Detecting face" in pip_t
    assert "bottom-3 right-3" in cbt_t
    assert "Timer keeps running during integrity pause" in cbt_t
    assert "onNeedReconnect={() => { void reconnectCamera(); }}" in cbt_t
    assert "!paused && Boolean(security.requireCamera)" not in cbt_t
    print("OK: all markers verified")


if __name__ == "__main__":
    main()
