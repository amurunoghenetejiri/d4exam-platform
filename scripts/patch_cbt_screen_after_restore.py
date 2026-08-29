from pathlib import Path
p = Path("src/components/cbt/CbtExamSession.impl.tsx")
t = p.read_text()
if "Full exam UI is being restored" in t:
    raise SystemExit("still stub")
if "startScreenShareStream" in t:
    print("screen share already present")
else:
    t = t.replace(
        'import { haptic } from "@/lib/haptic";',
        '''import { haptic } from "@/lib/haptic";
import { startScreenShareStream, onScreenShareEnded, stopScreenShareStream } from "@/lib/screen-share";
import { useLiveScreenPublish } from "@/lib/use-live-screen-publish";
import { useLiveCamPublish } from "@/lib/use-live-cam-publish";''',
        1,
    )
    if "screenStreamRef" not in t:
        t = t.replace(
            "  const mediaStreamRef = useRef<MediaStream | null>(null);",
            """  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [liveAttemptId, setLiveAttemptId] = useState<string | null>(null);""",
            1,
        )
    t = t.replace(
        """    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);""",
        """    stopMediaStream(mediaStreamRef.current);
    mediaStreamRef.current = null;
    setLiveStream(null);
    try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
    screenStreamRef.current = null;
    setScreenStream(null);""",
        1,
    )
    needle = """      if (security.fullscreen) {
        const ok = await requestExamFullscreen();
        if (!ok) { toast.message(\"Please allow fullscreen to continue the exam\"); setFsGate(true); }
      }"""
    insert = """      const needScreen = Boolean(security.requireScreenShare) && !_opts.skipScreenShare;
      if (needScreen) {
        const share = await startScreenShareStream();
        if (!share.ok) {
          toast.error(share.message || \"Screen sharing is required for this examination.\");
          return;
        }
        try { stopScreenShareStream(screenStreamRef.current); } catch { /* ignore */ }
        screenStreamRef.current = share.stream;
        setScreenStream(share.stream);
        onScreenShareEnded(share.stream, () => {
          toast.error(\"Screen sharing stopped. Re-enable to continue the exam.\");
          setPaused(true);
          setPauseReason(\"Screen sharing stopped\");
          setScreenStream(null);
          screenStreamRef.current = null;
        });
        toast.success(\"Screen sharing active\");
      }
      try { haptic(\"start\"); } catch { /* ignore */ }
      if (security.fullscreen) {
        const ok = await requestExamFullscreen();
        if (!ok) { toast.message(\"Please allow fullscreen to continue the exam\"); setFsGate(true); }
      }"""
    if needle in t:
        t = t.replace(needle, insert, 1)
    t = t.replace(
        "if (data?.id) attemptIdRef.current = data.id as string;",
        "if (data?.id) { attemptIdRef.current = data.id as string; setLiveAttemptId(data.id as string); }",
        1,
    )
    marker = "  // Integrity: fullscreen exit + app background / tab switch"
    if "useLiveScreenPublish({" not in t and marker in t:
        pub = """  useLiveCamPublish({
    enabled: started && !done && !previewMode && !paused && Boolean(security.requireCamera),
    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,
    studentId: student?.studentId,
    examId: id,
    attemptId: liveAttemptId || attemptIdRef.current,
    stream: liveStream,
    getStream: () => mediaStreamRef.current || liveStream,
  });
  useLiveScreenPublish({
    enabled: started && !done && !previewMode && !paused && Boolean(screenStream),
    schoolId: examQ.data?.school_id ?? student?.schoolId ?? session?.schoolId,
    studentId: student?.studentId,
    examId: id,
    attemptId: liveAttemptId || attemptIdRef.current,
    stream: screenStream,
    getStream: () => screenStreamRef.current || screenStream,
  });

"""
        t = t.replace(marker, pub + marker, 1)
    p.write_text(t)
    print("screen share patched into CBT")
print("done", p.stat().st_size)
