from pathlib import Path

p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
if "Full exam UI is being restored" in t:
    raise SystemExit("CBT still stub — restore first")

changed = []

old = '    <div className="flex min-h-dvh flex-col bg-slate-50 select-none">'
new = '    <div className="flex min-h-dvh flex-col overflow-y-auto bg-slate-50 select-none">'
if old in t:
    t = t.replace(old, new, 1)
    changed.append("scroll")
elif "overflow-y-auto bg-slate-50" in t:
    changed.append("scroll-already")

if 'action === "pause"' not in t[t.find("const applyConsequence"): t.find("const applyConsequence") + 1200]:
    old = """      if (action === \"warn\" || action === \"flag\") {
        setWarnBanner(description);
        try { haptic(\"tab_switch\"); } catch { /* ignore */ }
        window.setTimeout(() => setWarnBanner(null), 6000);
      } else if (action === \"terminate\") {
        setDoneTerminated(true);
        await finishAttempt(true);
      }
    };"""
    new = """      if (action === \"warn\" || action === \"flag\") {
        setWarnBanner(description);
        try { haptic(\"tab_switch\"); } catch { /* ignore */ }
        window.setTimeout(() => setWarnBanner(null), 6000);
      } else if (action === \"pause\") {
        const secs = Math.max(5, Number(security.pauseDurationSeconds ?? 30) || 30);
        setPauseReason(`${description} (paused ${secs}s)`);
        setPaused(true);
        try { haptic(\"strong\"); } catch { /* ignore */ }
        setWarnBanner(`Exam paused for ${secs}s due to integrity rules.`);
        window.setTimeout(() => {
          setPaused(false);
          setPauseReason(\"\");
          setWarnBanner(null);
          void restoreMediaAfterReturn();
        }, secs * 1000);
      } else if (action === \"terminate\") {
        setDoneTerminated(true);
        await finishAttempt(true);
      }
    };"""
    if old in t:
        t = t.replace(old, new, 1)
        changed.append("pause")
    else:
        changed.append("pause-MISSING")
else:
    changed.append("pause-already")

if "do NOT pause the exam" not in t and "Face violations warn only" not in t:
    face_pause = """    } else if (action === \"pause\") {
      setPauseReason(mapped.description || \"Face integrity violation\");
      setPaused(true);
    } else if (action === \"terminate\") {"""
    face_no = """    } else if (action === \"terminate\") {"""
    if face_pause in t:
        t = t.replace(face_pause, face_no, 1)
        changed.append("face-no-pause")
    t = t.replace(
        'const action = security.faceViolationAction || security.thresholdAction || "flag";',
        'const action = security.faceViolationAction || "flag";',
        1,
    )
    old_inc = "    if (isViolation) faceWarnCountRef.current += 1;"
    new_inc = """    if (isViolation) faceWarnCountRef.current += 1;
    if (isViolation) {
      try {
        if (ev.kind === \"multi\") haptic(\"multi\");
        else if (ev.kind === \"none\" || ev.kind === \"unclear\") haptic(\"none\");
        else if (ev.kind === \"camera_blocked\") haptic(\"camera_blocked\");
      } catch { /* ignore */ }
    }"""
    if old_inc in t and 'haptic("multi")' not in t:
        t = t.replace(old_inc, new_inc, 1)
        changed.append("face-haptic")
else:
    changed.append("face-already")

if "async function restoreMediaAfterReturn" not in t:
    restore_fn = """
  async function restoreMediaAfterReturn() {
    if (doneRef.current || finishingRef.current || !startedRef.current) return;
    try {
      if (security.requireCamera) {
        const dead = !mediaStreamRef.current || mediaStreamRef.current.getTracks().every((tr) => tr.readyState !== \"live\");
        if (dead) {
          try {
            const stream = await openCameraStream({
              facingMode: \"user\",
              audio: Boolean(security.requireMicrophone),
            });
            stopMediaStream(mediaStreamRef.current);
            mediaStreamRef.current = stream;
            setLiveStream(stream);
          } catch (e) {
            console.warn(\"[cbt] camera restore failed\", e);
          }
        }
      }
      if (security.requireScreenShare) {
        try {
          const mod = await import(\"@/lib/screen-share\");
          let ok = false;
          try { ok = await mod.ensureScreenShareRunning(); } catch { ok = false; }
          if (!ok) {
            const share = await mod.startScreenShareStream();
            if (share.ok && share.stream) {
              try { mod.stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
              screenStreamRef.current = share.stream;
              setScreenStream(share.stream);
              mod.onScreenShareEnded(share.stream, () => {
                setScreenStream(null);
                screenStreamRef.current = null;
              });
            }
          }
        } catch (e) {
          console.warn(\"[cbt] screen restore failed\", e);
        }
      }
    } catch (e) {
      console.warn(\"[cbt] restoreMediaAfterReturn\", e);
    }
  }

"""
    marker = "  const onFaceSecurityEvent = useCallback((ev: FaceSecurityEvent) => {"
    if marker in t:
        t = t.replace(marker, restore_fn + marker, 1)
        changed.append("restore-fn")
    else:
        changed.append("restore-fn-MISSING")

if 'document.visibilityState === "visible"' not in t:
    old = """    const onVis = () => {
      if (!security.tabMonitoring) return;
      if (document.visibilityState !== \"hidden\") return;"""
    new = """    const onVis = () => {
      if (finishingRef.current || doneRef.current) return;
      if (document.visibilityState === \"visible\") {
        void restoreMediaAfterReturn();
        return;
      }
      if (!security.tabMonitoring) return;
      if (document.visibilityState !== \"hidden\") return;"""
    if old in t:
        t = t.replace(old, new, 1)
        changed.append("onVis-return")
    else:
        changed.append("onVis-MISSING")

if "onNeedReconnect={() => {}}" in t:
    t = t.replace(
        "onNeedReconnect={() => {}}",
        "onNeedReconnect={() => { void restoreMediaAfterReturn(); }}",
        1,
    )
    changed.append("reconnect")

old = "security.maxTabSwitches, security.thresholdAction, id, index,"
new = "security.maxTabSwitches, security.thresholdAction, security.pauseDurationSeconds, id, index,"
if old in t and "security.pauseDurationSeconds, id" not in t:
    t = t.replace(old, new, 1)
    changed.append("deps")

p.write_text(t)
print("changes:", ", ".join(changed))
print("lines", len(t.splitlines()))
