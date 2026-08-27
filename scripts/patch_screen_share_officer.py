"""Wire officer live-monitor + CBT session for real screen-share frames."""
from pathlib import Path

# --- officer.live-monitor.tsx ---
p = Path("src/routes/officer.live-monitor.tsx")
t = p.read_text()

old_imp = '''import {
  isLiveCamFrameFresh,
  startLiveCamSubscriber,
  LIVE_CAM_STALE_MS,
  type LiveCamFramePayload,
} from "@/lib/live-video";'''
new_imp = '''import {
  isLiveCamFrameFresh,
  startLiveCamSubscriber,
  LIVE_CAM_STALE_MS,
  type LiveCamFramePayload,
  startLiveScreenSubscriber,
  isLiveScreenFrameFresh,
  type LiveScreenFramePayload,
} from "@/lib/live-video";'''
if old_imp in t:
    t = t.replace(old_imp, new_imp, 1)
    print("officer imports")
elif "startLiveScreenSubscriber" in t:
    print("officer imports already")
else:
    print("officer imports MISSING")

if "screenFrames" not in t:
    t = t.replace(
        'const [frames, setFrames] = useState<Record<string, FrameEntry>>({});',
        'const [frames, setFrames] = useState<Record<string, FrameEntry>>({});\n  const [screenFrames, setScreenFrames] = useState<Record<string, { src: string; ts: number }>>({});',
        1,
    )
    print("screenFrames state")

if "startLiveScreenSubscriber" not in t or "setScreenFrames" not in t:
    needle = "    return () => sub.stop();\n  }, [schoolId]);\n\n  useRealtimeInvalidate("
    insert = '''    return () => sub.stop();
  }, [schoolId]);

  // Live student screen frames (screen share)
  useEffect(() => {
    if (!schoolId) return;
    const sub = startLiveScreenSubscriber({
      schoolId,
      onFrame: (p: LiveScreenFramePayload) => {
        const attemptId = p.attemptId;
        if (!attemptId || !p.frame) return;
        const entry = { src: p.frame, ts: p.ts || Date.now() };
        const sid = String(p.studentId || "");
        setScreenFrames((prev) => {
          const next = { ...prev, [attemptId]: entry };
          if (sid) next[`student:${sid}`] = entry;
          return next;
        });
      },
    });
    return () => sub.stop();
  }, [schoolId]);

  useRealtimeInvalidate('''
    if needle in t:
        t = t.replace(needle, insert, 1)
        print("screen subscriber")
    else:
        print("subscriber insert point MISSING")
elif "Live student screen frames" in t:
    print("screen subscriber already")

if 'label="Screen"' not in t:
    t = t.replace(
        '<Info label="Camera" value={selected.presence.cameraActive ? "Active" : "Off"} />\n              <Info label="Face" value={selected.isDone ? "—" : faceLabel(selected.presence)} />',
        '''<Info label="Camera" value={selected.presence.cameraActive ? "Active" : "Off"} />
              <Info label="Face" value={selected.isDone ? "—" : faceLabel(selected.presence)} />
              <Info
                label="Screen"
                value={(() => {
                  const sf = screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`];
                  if (sf && isLiveScreenFrameFresh(sf.ts)) return "Sharing live";
                  return "Not sharing";
                })()}
              />''',
        1,
    )
    print("Screen info")

marker = '''            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3 text-sm sm:p-4">'''
screen_block = '''            {(() => {
              const sf = selected
                ? screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`]
                : null;
              const live = sf && isLiveScreenFrameFresh(sf.ts);
              if (!selected || selected.isDone) return null;
              return (
                <div className="border-b border-slate-100 px-3 py-2 sm:px-4">
                  <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                    Shared screen {live ? "· Live" : ""}
                  </p>
                  <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                    {live && sf ? (
                      <img src={sf.src} alt="Student screen" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-white/70">
                        <p className="text-xs font-semibold">Screen not shared yet</p>
                        <p className="text-[10px]">When the student shares their screen, it appears here.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3 text-sm sm:p-4">'''
if "Shared screen" not in t and marker in t:
    t = t.replace(marker, screen_block, 1)
    print("screen panel")
elif "Shared screen" in t:
    print("screen panel already")
else:
    print("screen panel marker MISSING")

p.write_text(t)
print("officer done")

# --- CbtExamSession.impl.tsx metadata + audit ---
p2 = Path("src/components/cbt/CbtExamSession.impl.tsx")
t2 = p2.read_text()
if "screenActive:" not in t2:
    t2 = t2.replace(
        "cameraActive: Boolean(mediaStreamRef.current || liveStream),",
        "cameraActive: Boolean(mediaStreamRef.current || liveStream),\n        screenActive: Boolean(screenStreamRef.current || screenStream),",
        1,
    )
    print("cbt meta")
if "SCREEN_SHARE_STARTED" not in t2:
    t2 = t2.replace(
        'toast.success("Screen sharing active");\n          } else if (share.reason === "denied") {',
        '''toast.success("Screen sharing active");
            try {
              const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId ?? "");
              if (schoolId && student?.studentId && id) {
                void logSecurityEvent({
                  schoolId,
                  examId: id,
                  attemptId: attemptIdRef.current,
                  studentId: student.studentId,
                  eventType: "SCREEN_SHARE_STARTED",
                  severity: "low",
                  description: "Screen sharing started",
                  extra: { source: "cbt_start" },
                });
              }
            } catch { /* ignore */ }
          } else if (share.reason === "denied") {''',
        1,
    )
    print("cbt start log")
if "SCREEN_SHARE_STOPPED" not in t2:
    t2 = t2.replace(
        '''onScreenShareEnded(share.stream, () => {
              toast.error("Screen sharing stopped. Re-enable to continue the exam.");
              setPaused(true);
              setScreenStream(null);
              screenStreamRef.current = null;
            });''',
        '''onScreenShareEnded(share.stream, () => {
              toast.error("Screen sharing stopped. Re-enable to continue the exam.");
              setPaused(true);
              setScreenStream(null);
              screenStreamRef.current = null;
              try {
                const schoolId = String(examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId ?? "");
                if (schoolId && student?.studentId && id && !doneRef.current) {
                  void logSecurityEvent({
                    schoolId,
                    examId: id,
                    attemptId: attemptIdRef.current,
                    studentId: student.studentId,
                    eventType: "SCREEN_SHARE_STOPPED",
                    severity: "high",
                    description: "Screen sharing stopped",
                    extra: { source: "track_ended" },
                  });
                }
              } catch { /* ignore */ }
            });''',
        1,
    )
    print("cbt stop log")
p2.write_text(t2)
print("cbt done")
