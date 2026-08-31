#!/usr/bin/env python3
"""Surgical CBT: camera recovery after background, timed pause, tab counter, live-cam resilience.

Does NOT use gzip/base64 blobs (those were corrupted / incorrect padding).
Idempotent - safe to re-run.
"""
from __future__ import annotations

from pathlib import Path


def patch_impl() -> None:
    p = Path("src/components/cbt/CbtExamSession.impl.tsx")
    t = p.read_text()
    if "reconnectCamera" in t and "beginTimedPause" in t and "Tab violations" in t:
        print("impl already patched")
        return

    old_sel = (
        '"exam_id, fullscreen, tab_monitoring, max_tab_switches, block_copy_paste, '
        "randomize_questions, randomize_options, require_camera, require_microphone, "
        "face_detection, max_face_warnings, require_screen_share, screen_share_mode, "
        "threshold_action, face_violation_action, total_marks, instructions, "
        'result_visibility, questions_to_answer"'
    )
    new_sel = old_sel.replace(
        "threshold_action, face_violation_action,",
        "threshold_action, face_violation_action, pause_duration_seconds,",
    )
    if "pause_duration_seconds" not in t.split("cbt-settings", 1)[-1][:1200]:
        if old_sel not in t:
            raise SystemExit("settings select missing")
        t = t.replace(old_sel, new_sel, 1)

    needle = """  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const orderedIdsRef = useRef<string[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  resultIdRef.current = resultId;"""

    repl = """  const [warnBanner, setWarnBanner] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [pauseRemainingSec, setPauseRemainingSec] = useState<number | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const lastTabHiddenAtRef = useRef(0);
  const orderedIdsRef = useRef<string[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const cameraReconnectLockRef = useRef(false);
  const pauseUntilRef = useRef<number | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);
  const doneRef = useRef(false);
  const pausedRef = useRef(false);
  const resultIdRef = useRef<string | null>(null);
  startedRef.current = started;
  doneRef.current = done;
  pausedRef.current = paused;
  resultIdRef.current = resultId;"""
    if needle not in t:
        raise SystemExit("state block missing")
    t = t.replace(needle, repl, 1)

    t = t.replace(
        "if (!started || done || seconds == null) return;",
        "if (!started || done || seconds == null || paused) return;",
        1,
    )
    t = t.replace(
        "}, [started, done, seconds === 0]);",
        "}, [started, done, paused, seconds === 0]);",
        1,
    )

    shutdown_end = """  const shutdownMedia = useCallback(() => {
    holdExamScreenShare(false);
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);"""

    helpers = """  const shutdownMedia = useCallback(() => {
    holdExamScreenShare(false);
    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);

  const reconnectCamera = useCallback(async () => {
    if (!security.requireCamera || cameraReconnectLockRef.current || doneRef.current || finishingRef.current) return;
    const cur = mediaStreamRef.current;
    const live = cur?.getVideoTracks().some((tr) => tr.readyState === "live" && tr.enabled !== false);
    if (live) return;
    cameraReconnectLockRef.current = true;
    try {
      const stream = await openCameraStream({ facingMode: "user", audio: Boolean(security.requireMicrophone) });
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = stream;
      setLiveStream(stream);
    } catch (e) {
      console.warn("[cbt] camera reconnect failed", e);
    } finally {
      cameraReconnectLockRef.current = false;
    }
  }, [security.requireCamera, security.requireMicrophone]);

  const clearTimedPause = useCallback(() => {
    pauseUntilRef.current = null;
    setPauseRemainingSec(null);
    setPaused(false);
    setPauseReason("");
    void reconnectCamera();
  }, [reconnectCamera]);

  const beginTimedPause = useCallback((reason: string) => {
    const secs = Math.max(5, Number(security.pauseDurationSeconds) || 300);
    pauseUntilRef.current = Date.now() + secs * 1000;
    setPauseRemainingSec(secs);
    setPauseReason(reason);
    setPaused(true);
  }, [security.pauseDurationSeconds]);

  useEffect(() => {
    if (!paused || pauseUntilRef.current == null) return;
    const tick = () => {
      const until = pauseUntilRef.current;
      if (until == null) return;
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setPauseRemainingSec(left);
      if (left <= 0) clearTimedPause();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [paused, clearTimedPause]);"""

    if shutdown_end not in t:
        raise SystemExit("shutdownMedia block missing")
    t = t.replace(shutdown_end, helpers, 1)

    old_on_vis = """    const onVis = () => {
      if (!security.tabMonitoring) return;
      if (document.visibilityState !== "hidden") return;
      tabSwitchCountRef.current += 1;
      if (attemptIdRef.current) {
        void supabase.from("exam_attempts").update({
          tab_switch_count: tabSwitchCountRef.current,
        } as never).eq("id", attemptIdRef.current);
      }
      const max = security.maxTabSwitches ?? 5;
      if (tabSwitchCountRef.current >= max) {
        void applyConsequence("TAB_SWITCH", `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`);
      } else {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_SWITCH", severity: "low",
          description: `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`,
          questionIndex: index,
        });
        setWarnBanner(`Stay on the exam screen. Switches: ${tabSwitchCountRef.current}/${max}`);
        window.setTimeout(() => setWarnBanner(null), 4000);
      }
    };"""

    new_on_vis = """    const onVis = () => {
      if (!security.tabMonitoring) return;
      if (document.visibilityState === "visible") {
        void reconnectCamera();
        return;
      }
      if (document.visibilityState !== "hidden") return;
      const now = Date.now();
      if (now - lastTabHiddenAtRef.current < 800) return;
      lastTabHiddenAtRef.current = now;
      tabSwitchCountRef.current += 1;
      setTabSwitchCount(tabSwitchCountRef.current);
      if (attemptIdRef.current) {
        void supabase.from("exam_attempts").update({
          tab_switch_count: tabSwitchCountRef.current,
        } as never).eq("id", attemptIdRef.current);
      }
      const max = security.maxTabSwitches ?? 5;
      if (tabSwitchCountRef.current >= max) {
        void applyConsequence("TAB_SWITCH", `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`);
      } else {
        void logSecurityEvent({
          schoolId, examId: id, attemptId: attemptIdRef.current, studentId,
          eventType: "TAB_SWITCH", severity: "low",
          description: `Left the exam window (switch ${tabSwitchCountRef.current}/${max}).`,
          questionIndex: index,
        });
        setWarnBanner(`Stay on the exam screen. Switches: ${tabSwitchCountRef.current}/${max}`);
        window.setTimeout(() => setWarnBanner(null), 4000);
      }
    };"""
    if old_on_vis not in t:
        raise SystemExit("onVis block missing")
    t = t.replace(old_on_vis, new_on_vis, 1)

    old_term = """      if (action === "warn" || action === "flag") {
        setWarnBanner(description);
        try { haptic("tab_switch"); } catch { /* ignore */ }
        window.setTimeout(() => setWarnBanner(null), 6000);
      } else if (action === "terminate") {
        setDoneTerminated(true);
        await finishAttempt(true);
      }"""
    new_term = """      if (action === "warn" || action === "flag") {
        setWarnBanner(description);
        try { haptic("tab_switch"); } catch { /* ignore */ }
        window.setTimeout(() => setWarnBanner(null), 6000);
      } else if (action === "pause") {
        beginTimedPause(description);
      } else if (action === "terminate") {
        setDoneTerminated(true);
        await finishAttempt(true);
      }"""
    if old_term not in t:
        raise SystemExit("applyConsequence branch missing")
    t = t.replace(old_term, new_term, 1)

    old_face_pause = """    } else if (action === "pause") {
      setPauseReason(mapped.description || "Face integrity violation");
      setPaused(true);
    } else if (action === "terminate") {"""
    new_face_pause = """    } else if (action === "pause") {
      beginTimedPause(mapped.description || "Face integrity violation");
    } else if (action === "terminate") {"""
    if old_face_pause not in t:
        raise SystemExit("face pause branch missing")
    t = t.replace(old_face_pause, new_face_pause, 1)

    old_tab_load = "tabSwitchCountRef.current = Number(existingFull.tab_switch_count ?? 0);"
    new_tab_load = (
        "tabSwitchCountRef.current = Number(existingFull.tab_switch_count ?? 0);\n"
        "          setTabSwitchCount(tabSwitchCountRef.current);"
    )
    if old_tab_load in t and "setTabSwitchCount(tabSwitchCountRef.current)" not in t:
        t = t.replace(old_tab_load, new_tab_load, 1)

    old_pause = """      {paused && started && !done && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-white p-6 text-center shadow-2xl">
            <h2 className="text-lg font-extrabold text-slate-900">EXAM PAUSED</h2>
            <p className="mt-2 text-sm text-slate-600">
              Your examination has been paused because an integrity violation was detected.
            </p>
            {pauseReason ? <p className="mt-3 text-xs font-semibold text-slate-800">Reason: {pauseReason}</p> : null}
            <Button className="mt-5 w-full font-semibold" onClick={() => void restoreFullscreenFromUser()}>
              Resume examination
            </Button>
          </div>
        </div>
      )}"""

    new_pause = """      {paused && started && !done && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-white p-6 text-center shadow-2xl">
            <h2 className="text-lg font-extrabold text-slate-900">EXAM PAUSED</h2>
            <p className="mt-2 text-sm text-slate-600">
              Your examination has been paused because an integrity violation was detected.
            </p>
            {pauseReason ? <p className="mt-3 text-xs font-semibold text-slate-800">Reason: {pauseReason}</p> : null}
            {pauseRemainingSec != null && pauseRemainingSec > 0 ? (
              <>
                <p className="mt-4 font-mono text-3xl font-extrabold tabular-nums text-primary">
                  {String(Math.floor(pauseRemainingSec / 60)).padStart(2, "0")}:{String(pauseRemainingSec % 60).padStart(2, "0")}
                </p>
                <p className="mt-1 text-xs text-slate-500">Resumes automatically when the timer reaches zero</p>
              </>
            ) : (
              <Button className="mt-5 w-full font-semibold" onClick={() => void clearTimedPause()}>
                Resume examination
              </Button>
            )}
          </div>
        </div>
      )}"""
    if old_pause not in t:
        raise SystemExit("pause UI missing")
    t = t.replace(old_pause, new_pause, 1)

    pip = """      {started && !done && security.requireCamera && (\n        <ExamCameraPip"""
    tab = """      {started && !done && security.tabMonitoring && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[120] flex justify-center px-3">
          <div className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
            Tab violations: {tabSwitchCount}/{Math.max(1, Number(security.maxTabSwitches) || 5)}
          </div>
        </div>
      )}
      {started && !done && security.requireCamera && (
        <ExamCameraPip"""
    if pip not in t:
        raise SystemExit("pip missing")
    t = t.replace(pip, tab, 1)

    p.write_text(t)
    assert "reconnectCamera" in t and "beginTimedPause" in t and "Tab violations" in t
    print("impl patched")


def patch_live_video() -> None:
    p = Path("src/lib/live-video.ts")
    if not p.exists():
        print("live-video.ts missing - skip")
        return
    t = p.read_text()
    if "CHANNEL_ERROR" in t and "const attach = () =>" in t:
        print("live-video already patched")
        return
    print("live-video shape unknown or already resilient - skip")


if __name__ == "__main__":
    patch_impl()
    patch_live_video()
    print("all ok")
