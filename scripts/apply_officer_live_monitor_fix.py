#!/usr/bin/env python3
"""Surgical fix for officer live-monitor + student officer command listener."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def patch_officer():
    path = ROOT / "src/routes/officer.live-monitor.tsx"
    text = path.read_text()
    if "showCamFrame" in text and "officerControl" in text and "GRACE_MS" in text:
        print("officer.live-monitor.tsx already patched")
        return

    old_cleanup = """  useEffect(() => {
    const liveIds = new Set([
      ...(attemptsQ.data ?? []).map((a) => a.id),
      ...(recentDoneQ.data ?? []).map((a) => a.id),
    ]);
    setFrames((prev) => {
      const next: Record<string, FrameEntry> = {};
      let changed = false;
      for (const [id, entry] of Object.entries(prev)) {
        if (liveIds.has(id)) next[id] = entry;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [attemptsQ.data, recentDoneQ.data]);"""

    new_cleanup = """  useEffect(() => {
    // Soft prune only — keep last valid frames through transient query gaps / Realtime hiccups.
    const liveIds = new Set([
      ...(attemptsQ.data ?? []).map((a) => a.id),
      ...(recentDoneQ.data ?? []).map((a) => a.id),
    ]);
    const GRACE_MS = 3 * 60 * 1000;
    const nowMs = Date.now();
    setFrames((prev) => {
      const next: Record<string, FrameEntry> = {};
      let changed = false;
      for (const [id, entry] of Object.entries(prev)) {
        const ageOk = entry.ts != null && nowMs - entry.ts < GRACE_MS;
        const idOk = liveIds.has(id) || id.startsWith("student:");
        if (idOk || ageOk) next[id] = entry;
        else changed = true;
      }
      return changed ? next : prev;
    });
    setScreenFrames((prev) => {
      const next: Record<string, { src: string; ts: number }> = {};
      let changed = false;
      for (const [id, entry] of Object.entries(prev)) {
        const ageOk = entry.ts != null && nowMs - entry.ts < GRACE_MS;
        const idOk = liveIds.has(id) || id.startsWith("student:");
        if (idOk || ageOk) next[id] = entry;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [attemptsQ.data, recentDoneQ.data]);"""
    if old_cleanup not in text:
        raise SystemExit("cleanup block not found")
    text = text.replace(old_cleanup, new_cleanup, 1)

    old_map = """        const camFrame = frames[a.id] || frames[`student:${a.student_id}`];
        const scrFrame = screenFrames[a.id] || screenFrames[`student:${a.student_id}`];
        const frame = pickFeedFrame(feedMode, camFrame, scrFrame);
        const st = String(a.status || "").toLowerCase();
        const isDone = ["submitted", "terminated", "flagged", "completed"].includes(st);
        const camLive = Boolean(camFrame && isLiveCamFrameFresh(camFrame.ts, now));
        const scrLive = Boolean(scrFrame && isLiveScreenFrameFresh(scrFrame.ts, now));
        const hasLiveVideo = !isDone && (
          feedMode === "screen" ? scrLive : feedMode === "camera" ? camLive : (camLive || scrLive)
        );"""
    new_map = """        const camFrame = frames[a.id] || frames[`student:${a.student_id}`] || null;
        const scrFrame = screenFrames[a.id] || screenFrames[`student:${a.student_id}`] || null;
        const frame = pickFeedFrame(feedMode, camFrame, scrFrame);
        const st = String(a.status || "").toLowerCase();
        const isDone = ["submitted", "terminated", "flagged", "completed"].includes(st);
        const camLive = Boolean(camFrame && isLiveCamFrameFresh(camFrame.ts, now));
        const scrLive = Boolean(scrFrame && isLiveScreenFrameFresh(scrFrame.ts, now));
        const hasLiveVideo = !isDone && (
          feedMode === "screen" ? scrLive : feedMode === "camera" ? camLive : (camLive || scrLive)
        );"""
    if old_map not in text:
        raise SystemExit("card map not found")
    text = text.replace(old_map, new_map, 1)

    old_return = "        return { a, presence, sev, name, matric, course, title, frame, hasLiveVideo, bars, isDone, activity, videoStatus };"
    new_return = "        return { a, presence, sev, name, matric, course, title, frame, camFrame, scrFrame, camLive, scrLive, hasLiveVideo, bars, isDone, activity, videoStatus };"
    if old_return not in text:
        raise SystemExit("card return not found")
    text = text.replace(old_return, new_return, 1)

    pattern = r"            \{\(\(\) => \{\n              const camSrc = selected\.frame\?\.src;[\s\S]*?            \}\)\(\)\}"
    new_focus = """            {(() => {
              const camF = selected.camFrame || frames[selected.a.id] || frames[`student:${selected.a.student_id}`] || null;
              const sf = selected.scrFrame || screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`] || null;
              const camLive = Boolean(camF && isLiveCamFrameFresh(camF.ts));
              const scrLive = Boolean(sf && isLiveScreenFrameFresh(sf.ts));
              const showCamFrame = Boolean(camF?.src) && !selected.isDone;
              const showScrFrame = Boolean(sf?.src) && !selected.isDone;
              const showCam = feedMode === "camera" || feedMode === "both";
              const showScr = feedMode === "screen" || feedMode === "both";
              const dual = showCam && showScr;
              return (
                <div
                  className={cn(
                    "shrink-0 gap-1.5 bg-slate-100 p-1.5 sm:gap-2 sm:p-2",
                    dual ? "grid grid-cols-1 sm:grid-cols-[1.35fr_1fr]" : "grid grid-cols-1",
                  )}
                >
                  {showCam && (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10">
                      {showCamFrame ? (
                        <img src={camF!.src} alt={`${selected.name} camera`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 text-center text-white/70">
                          {selected.isDone ? (
                            <CheckCircle2 className="h-10 w-10 text-emerald-400/80" />
                          ) : (
                            <CameraOff className="h-10 w-10 opacity-40" />
                          )}
                          <p className="text-xs font-semibold text-white/90">
                            {selected.isDone ? doneStatusLabel(selected.a.status) : "Camera offline"}
                          </p>
                        </div>
                      )}
                      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                        <span className={cn("h-1.5 w-1.5 rounded-full", camLive ? "animate-pulse bg-red-500" : showCamFrame ? "bg-amber-400" : "bg-slate-400")} />
                        Camera{camLive ? " · Live" : showCamFrame ? " · Delayed" : ""}
                      </div>
                      {showCamFrame && (
                        <div className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-1 backdrop-blur-sm">
                          <SignalBars bars={selected.bars} />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
                        <p className="truncate text-xs font-extrabold text-white">{selected.name}</p>
                        <p className="truncate text-[10px] text-white/80">{selected.matric}</p>
                      </div>
                    </div>
                  )}
                  {showScr && (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10">
                      {showScrFrame ? (
                        <img src={sf!.src} alt={`${selected.name} screen`} className="h-full w-full object-contain bg-black" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center text-white/60">
                          <Monitor className="h-10 w-10 opacity-30" />
                          <p className="text-xs font-semibold text-white/80">Screen not shared</p>
                          <p className="text-[10px] text-white/50">Appears when the student shares their screen</p>
                        </div>
                      )}
                      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                        <span className={cn("h-1.5 w-1.5 rounded-full", scrLive ? "animate-pulse bg-emerald-400" : showScrFrame ? "bg-amber-400" : "bg-slate-400")} />
                        Screen {scrLive ? "· Live" : showScrFrame ? "· Delayed" : ""}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}"""
    text2, n = re.subn(pattern, new_focus, text, count=1)
    if n != 1:
        raise SystemExit(f"focus IIFE replace failed n={n}")
    text = text2

    if "const [actionBusy, setActionBusy]" not in text:
        text = text.replace(
            "const [warningBusy, setWarningBusy] = useState(false);",
            "const [warningBusy, setWarningBusy] = useState(false);\n  const [actionBusy, setActionBusy] = useState(false);",
            1,
        )

    old_warn = """            {!selected.isDone && (
              <div className="flex flex-wrap gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  disabled={warningBusy}
                  onClick={() => void sendOfficerWarning()}
                >
                  {warningBusy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Send warning
                </Button>
                <p className="w-full text-[10px] text-slate-400">
                  Student gets a red alert instantly. Event is logged. Live video is never saved.
                </p>
              </div>
            )}"""
    new_warn = """            {!selected.isDone && (
              <div className="flex flex-wrap gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  disabled={warningBusy || actionBusy}
                  onClick={() => void sendOfficerWarning()}
                >
                  {warningBusy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Send warning
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("submit")}>
                  {actionBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Submit Exam
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" disabled={actionBusy || warningBusy} onClick={() => void officerControl("hold")}>
                  Hold Exam
                </Button>
                <Button size="sm" variant="outline" className="h-8 border-red-300 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100" disabled={actionBusy || warningBusy} onClick={() => void officerControl("terminate")}>
                  Terminate Exam
                </Button>
                <p className="w-full text-[10px] text-slate-400">
                  Actions apply server-side and reach the student live. Live video is never saved.
                </p>
              </div>
            )}"""
    if old_warn not in text:
        raise SystemExit("warn block not found")
    text = text.replace(old_warn, new_warn, 1)

    if "async function officerControl" not in text:
        marker = "  async function sendOfficerWarning() {"
        officer_fn = """  async function broadcastOfficerCommand(cmd: "submit" | "hold" | "terminate", attemptId: string, studentId: string, examId: string) {
    try {
      const ch = supabase.channel(`student-exam-cmd:${studentId}`);
      await new Promise<void>((resolve) => {
        const t = window.setTimeout(() => resolve(), 2000);
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            window.clearTimeout(t);
            resolve();
          }
        });
      });
      await ch.send({
        type: "broadcast",
        event: "officer_command",
        payload: { command: cmd, attemptId, studentId, examId, ts: Date.now() },
      });
      window.setTimeout(() => { void supabase.removeChannel(ch); }, 1200);
    } catch (e) {
      console.warn("[live-monitor] officer_command broadcast", e);
    }
  }

  async function officerControl(cmd: "submit" | "hold" | "terminate") {
    if (!selected || !schoolId || actionBusy || selected.isDone) return;
    const labels = { submit: "force-submit", hold: "hold/pause", terminate: "terminate" } as const;
    if (!window.confirm(`Are you sure you want to ${labels[cmd]} this student's examination?`)) return;
    setActionBusy(true);
    try {
      const attemptId = selected.a.id;
      const studentId = selected.a.student_id;
      const examId = selected.a.exam_id;
      const nowIso = new Date().toISOString();
      if (cmd === "hold") {
        const meta = { ...(selected.a.metadata || {}), officer_hold: true, officer_hold_at: nowIso };
        const { error } = await supabase.from("exam_attempts").update({ metadata: meta, updated_at: nowIso } as never).eq("id", attemptId).eq("school_id", schoolId);
        if (error) throw error;
        await logSecurityEvent({ schoolId, examId, attemptId, studentId, eventType: "OFFICER_HOLD", severity: "medium", description: "Examination held by officer", extra: { source: "officer_live_monitor", officer_user_id: user?.userId ?? null } });
        await broadcastOfficerCommand("hold", attemptId, studentId, examId);
        toast.success(`Hold sent to ${selected.name}`);
      } else if (cmd === "terminate") {
        const { error } = await supabase.from("exam_attempts").update({ status: "terminated", terminated_at: nowIso, submitted_at: nowIso, security_review_status: "terminated", updated_at: nowIso } as never).eq("id", attemptId).eq("school_id", schoolId);
        if (error) throw error;
        await logSecurityEvent({ schoolId, examId, attemptId, studentId, eventType: "OFFICER_TERMINATE", severity: "high", description: "Examination terminated by officer", extra: { source: "officer_live_monitor", officer_user_id: user?.userId ?? null } });
        await broadcastOfficerCommand("terminate", attemptId, studentId, examId);
        toast.success(`Terminated ${selected.name}`);
        setSelectedId(null);
      } else {
        const { error } = await supabase.from("exam_attempts").update({ status: "submitted", submitted_at: nowIso, updated_at: nowIso } as never).eq("id", attemptId).eq("school_id", schoolId);
        if (error) throw error;
        await logSecurityEvent({ schoolId, examId, attemptId, studentId, eventType: "OFFICER_SUBMIT", severity: "medium", description: "Examination force-submitted by officer", extra: { source: "officer_live_monitor", officer_user_id: user?.userId ?? null } });
        await broadcastOfficerCommand("submit", attemptId, studentId, examId);
        toast.success(`Submit command sent to ${selected.name}`);
        setSelectedId(null);
      }
      void attemptsQ.refetch();
      void recentDoneQ.refetch();
      void eventsQ.refetch();
    } catch (e) {
      toast.error("Could not apply officer action");
      console.warn(e);
    } finally {
      setActionBusy(false);
    }
  }

  async function sendOfficerWarning() {
"""
        if marker not in text:
            raise SystemExit("sendOfficerWarning marker missing")
        text = text.replace(marker, officer_fn, 1)

    text = text.replace(
        "frameSrc={c.hasLiveVideo ? c.frame?.src : undefined}\n                  streamLive={c.hasLiveVideo}",
        "frameSrc={c.camFrame?.src || c.frame?.src || c.scrFrame?.src}\n                  streamLive={c.hasLiveVideo || Boolean(c.camLive || c.scrLive)}",
        1,
    )
    text = text.replace(
        """) : c.hasLiveVideo && c.frame?.src ? (
                        <img src={c.frame.src} alt="" className="h-full w-full object-cover" />
                      ) : (""",
        """) : (c.camFrame?.src || c.scrFrame?.src || c.frame?.src) ? (
                        <img
                          src={(c.camFrame?.src || c.frame?.src || c.scrFrame?.src)!}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (""",
        1,
    )
    text = text.replace(
        """.eq("school_id", schoolId)
          .eq("status", "in_progress")
          .order("started_at", { ascending: false })
          .limit(120);""",
        """.eq("school_id", schoolId)
          .in("status", ["in_progress", "paused", "held", "active"])
          .order("started_at", { ascending: false })
          .limit(120);""",
        1,
    )

    path.write_text(text)
    print("patched", path)

def patch_cbt():
    path = ROOT / "src/components/cbt/CbtExamSession.impl.tsx"
    text = path.read_text()
    if "officer_command" in text:
        print("CbtExamSession already has officer_command")
        return
    marker = """  useLiveScreenPublish({
    enabled: started && !done && !previewMode && Boolean(screenStream),
    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,
    studentId: student?.studentId,
    examId: id,
    attemptId: liveAttemptId || attemptIdRef.current,
    stream: screenStream,
    getStream: () => screenStreamRef.current || screenStream,
  });
"""
    if marker not in text:
        raise SystemExit("screen publish marker not found in CBT")
    insert = marker + """
  useEffect(() => {
    if (!started || done || previewMode) return;
    const studentId = student?.studentId;
    if (!studentId) return;
    const ch = supabase.channel(`student-exam-warn:${studentId}`);
    ch.on("broadcast", { event: "officer_warning" }, ({ payload }) => {
      const p = payload as { message?: string; examId?: string };
      if (p?.examId && id && String(p.examId) !== String(id)) return;
      if (doneRef.current) return;
      const msg = p?.message || "Warning from examination officer";
      setWarnBanner(msg);
      try { haptic("officer_warning"); } catch { /* ignore */ }
      window.setTimeout(() => setWarnBanner(null), 10000);
    });
    void ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [started, done, previewMode, student?.studentId, id]);

  useEffect(() => {
    if (!started || done || previewMode) return;
    const studentId = student?.studentId;
    if (!studentId) return;
    const ch = supabase.channel(`student-exam-cmd:${studentId}`);
    ch.on("broadcast", { event: "officer_command" }, ({ payload }) => {
      const p = payload as { command?: string; examId?: string; attemptId?: string };
      if (!p?.command) return;
      if (p.examId && id && String(p.examId) !== String(id)) return;
      if (doneRef.current || finishingRef.current) return;
      const cmd = String(p.command).toLowerCase();
      if (cmd === "hold") {
        beginTimedPause("Held by examination officer");
        setWarnBanner("Your examination has been held by the officer");
        window.setTimeout(() => setWarnBanner(null), 8000);
      } else if (cmd === "terminate") {
        setDoneTerminated(true);
        void finishAttempt(true);
      } else if (cmd === "submit") {
        void finishAttempt(false);
      }
    });
    void ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, done, previewMode, student?.studentId, id]);
"""
    text = text.replace(marker, insert, 1)
    path.write_text(text)
    print("patched", path)

if __name__ == "__main__":
    patch_officer()
    patch_cbt()
    print("OK")
