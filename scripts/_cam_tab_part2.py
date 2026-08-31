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
    if old_pause not in t: raise SystemExit("pause UI missing")
    t = t.replace(old_pause, new_pause, 1)

    pip = "      {started && !done && security.requireCamera && (\n        <ExamCameraPip"
    tab = """      {started && !done && security.tabMonitoring && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[120] flex justify-center px-3">
          <div className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
            Tab violations: {tabSwitchCount}/{Math.max(1, Number(security.maxTabSwitches) || 5)}
          </div>
        </div>
      )}
      {started && !done && security.requireCamera && (
        <ExamCameraPip"""
    if pip not in t: raise SystemExit("pip missing")
    t = t.replace(pip, tab, 1)

    p.write_text(t)
    assert "reconnectCamera" in t and "beginTimedPause" in t and "Tab violations" in t
    print("impl patched")

def patch_live_video():
    p = Path("src/lib/live-video.ts")
    t = p.read_text()
    if "CHANNEL_ERROR" in t and "const attach = () =>" in t:
        print("live-video already patched"); return
    old = """  channel = supabase.channel(liveCamChannelName(opts.schoolId), {
    config: { broadcast: { ack: false, self: false } },
  });

  const sendFrame = async () => {
    if (stopped || publishing) return;
    const stream = opts.getStream();
    if (!stream) return;
    publishing = true;
    try {
      const frame = await captureJpegFromStream(stream, { maxWidth: 360, quality: 0.52, mirror: true });
      if (stopped || !frame || !channel) return;
      const meta = opts.getFaceMeta?.() || {};
      void channel.send({
        type: "broadcast",
        event: LIVE_CAM_EVENT,
        payload: {
          attemptId: opts.attemptId,
          studentId: opts.studentId,
          examId: opts.examId,
          frame,
          ts: Date.now(),
          faceStatus: meta.faceStatus ?? "ok",
          cameraActive: meta.cameraActive !== false,
          answeredCount: meta.answeredCount,
          totalQuestions: meta.totalQuestions,
          timeRemainingSec: meta.timeRemainingSec,
        },
      });
    } catch (e) {
      console.warn("[live-cam]", e);
    } finally {
      publishing = false;
    }
  };

  void channel.subscribe((status) => {
    if (status === "SUBSCRIBED" && !stopped) {
      void sendFrame();
      timer = setInterval(() => void sendFrame(), intervalMs);
    }
  });

  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    },
  };
}"""
    new = """  let channelName = `${liveCamChannelName(opts.schoolId)}:${opts.attemptId}:${Math.random().toString(36).slice(2, 8)}`;

  const clearTimer = () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
  const ensureTimer = () => {
    if (stopped || timer) return;
    void sendFrame();
    timer = setInterval(() => void sendFrame(), intervalMs);
  };
  const sendFrame = async () => {
    if (stopped || publishing) return;
    const stream = opts.getStream();
    if (!stream) return;
    if (!stream.getVideoTracks().some((tr) => tr.readyState === "live" && tr.enabled !== false)) return;
    publishing = true;
    try {
      const frame = await captureJpegFromStream(stream, { maxWidth: 360, quality: 0.52, mirror: true });
      if (stopped || !frame || !channel) return;
      const meta = opts.getFaceMeta?.() || {};
      void channel.send({
        type: "broadcast",
        event: LIVE_CAM_EVENT,
        payload: {
          attemptId: opts.attemptId,
          studentId: opts.studentId,
          examId: opts.examId,
          frame,
          ts: Date.now(),
          faceStatus: meta.faceStatus ?? "ok",
          cameraActive: meta.cameraActive !== false,
          answeredCount: meta.answeredCount,
          totalQuestions: meta.totalQuestions,
          timeRemainingSec: meta.timeRemainingSec,
        },
      });
    } catch (e) {
      console.warn("[live-cam]", e);
    } finally {
      publishing = false;
    }
  };
  const attach = () => {
    if (stopped) return;
    if (channel) { try { void supabase.removeChannel(channel); } catch { /* ignore */ } channel = null; }
    clearTimer();
    channelName = `${liveCamChannelName(opts.schoolId)}:${opts.attemptId}:${Math.random().toString(36).slice(2, 8)}`;
    channel = supabase.channel(channelName, { config: { broadcast: { ack: false, self: false } } });
    void channel.subscribe((status) => {
      if (stopped) return;
      if (status === "SUBSCRIBED") ensureTimer();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimer();
        if (!stopped) window.setTimeout(() => { if (!stopped) attach(); }, 2000);
      }
    });
  };
  attach();
  return {
    stop: () => {
      stopped = true;
      clearTimer();
      if (channel) { void supabase.removeChannel(channel); channel = null; }
    },
  };
}"""
    if old not in t: raise SystemExit("live-video block missing")
    p.write_text(t.replace(old, new, 1))
    print("live-video patched")

if __name__ == "__main__":
    patch_impl()
    patch_live_video()
    print("all ok")
