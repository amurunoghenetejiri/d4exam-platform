import { useCallback, useEffect, useRef, useState } from "react";
import { openCameraStream } from "@/native/cameraService";
import { toast } from "sonner";
import { GripHorizontal } from "lucide-react";
import { haptic as fireHaptic, refreshHapticUnlock, type HapticKind } from "@/lib/haptic";
import { createFaceEngine, type FaceEngine } from "@/lib/face-detector";
import { cn } from "@/lib/utils";

type FaceState = "ok" | "none" | "multi" | "unclear" | "unavailable";
type CamConnState = "active" | "reconnecting" | "unavailable";
type SecurityAlertKind = "none" | "multi" | "unclear" | "camera_blocked";

function haptic(kind: SecurityAlertKind) {
  if (kind === "camera_blocked") return;
  if (kind === "none") fireHaptic("none");
  else if (kind === "unclear") fireHaptic("unclear");
  else if (kind === "multi") fireHaptic("multi");
}

const ALERT_COOLDOWN_MS = 1800;
const FACE_TICK_MS = 450;
const ENGINE_TIMEOUT_MS = 6000;

const ALERT_COPY: Record<
  SecurityAlertKind,
  { message: string; toastId: string; level: "warning" | "error" }
> = {
  none: {
    message: "Face not detected. Please position your face in the camera.",
    toastId: "cbt-face-none",
    level: "warning",
  },
  multi: {
    message: "Multiple faces detected. Only the candidate should be visible.",
    toastId: "cbt-face-multi",
    level: "error",
  },
  unclear: {
    message: "Please face the camera clearly.",
    toastId: "cbt-face-unclear",
    level: "warning",
  },
  camera_blocked: {
    message: "Camera view blocked. Please check your camera.",
    toastId: "cbt-cam-blocked",
    level: "error",
  },
};

function stopStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
}

function streamIsLive(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false;
  const tracks = stream.getVideoTracks();
  if (tracks.length === 0) return false;
  return tracks.some((t) => t.readyState === "live" && t.enabled !== false);
}

function viewportSize() {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  return {
    w: vv?.width ?? window.innerWidth,
    h: vv?.height ?? window.innerHeight,
  };
}

function clampPos(left: number, top: number, elW: number, elH: number) {
  const edge = 4;
  const { w, h } = viewportSize();
  const maxL = Math.max(edge, w - elW - edge);
  const maxT = Math.max(edge, h - elH - edge);
  return {
    left: Math.min(maxL, Math.max(edge, left)),
    top: Math.min(maxT, Math.max(edge, top)),
  };
}

export type FaceSecurityEvent = {
  kind: SecurityAlertKind | "ok";
  faceCount: number | null;
  at: string;
};

export function ExamCameraPip({
  enabled = true,
  faceDetection = false,
  maxFaceWarnings = 3,
  stream: externalStream,
  onSecurityEvent,
  onNeedReconnect,
}: {
  enabled?: boolean;
  faceDetection?: boolean;
  maxFaceWarnings?: number;
  stream?: MediaStream | null;
  onSecurityEvent?: (event: FaceSecurityEvent) => void;
  onNeedReconnect?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipRef = useRef<HTMLDivElement | null>(null);
  const faceEngineRef = useRef<FaceEngine | null>(null);
  const faceWarnRef = useRef(0);
  const lastAlertRef = useRef(0);
  const lastStateRef = useRef<FaceState>("unavailable");
  const ownStreamRef = useRef<MediaStream | null>(null);
  const acquiringRef = useRef(false);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);
  const posRef = useRef({ left: 4, top: 4 });
  const onSecRef = useRef(onSecurityEvent);
  onSecRef.current = onSecurityEvent;
  const onNeedRef = useRef(onNeedReconnect);
  onNeedRef.current = onNeedReconnect;

  const [pos, setPos] = useState({ left: 4, top: 4 });
  const [faceStatus, setFaceStatus] = useState<FaceState>(
    faceDetection ? "unclear" : "unavailable",
  );
  const [stream, setStream] = useState<MediaStream | null>(externalStream ?? null);
  const [camConn, setCamConn] = useState<CamConnState>(
    externalStream ? "active" : enabled ? "reconnecting" : "unavailable",
  );
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    const keepInView = () => {
      const el = pipRef.current;
      const w = el?.offsetWidth || 132;
      const h = el?.offsetHeight || 160;
      setPos((p) => clampPos(p.left, p.top, w, h));
    };
    window.addEventListener("resize", keepInView);
    window.visualViewport?.addEventListener("resize", keepInView);
    window.visualViewport?.addEventListener("scroll", keepInView);
    return () => {
      window.removeEventListener("resize", keepInView);
      window.visualViewport?.removeEventListener("resize", keepInView);
      window.visualViewport?.removeEventListener("scroll", keepInView);
    };
  }, []);

  const fireAlert = useCallback((kind: SecurityAlertKind, faceCount: number | null) => {
    const now = Date.now();
    if (now - lastAlertRef.current < ALERT_COOLDOWN_MS) return;
    lastAlertRef.current = now;

    try {
      refreshHapticUnlock();
      haptic(kind);
    } catch {
      /* ignore */
    }

    const copy = ALERT_COPY[kind];
    const opts = {
      id: copy.toastId,
      duration: 3200,
      className: "cbt-exam-toast",
    };
    if (copy.level === "error") {
      toast.error(copy.message, opts);
    } else {
      toast.warning(copy.message, opts);
    }
    onSecRef.current?.({
      kind,
      faceCount,
      at: new Date().toISOString(),
    });
  }, []);

  const acquireOwnCamera = useCallback(
    async (reason: "mount" | "reconnect") => {
      if (externalStream) return;
      if (!enabled) return;
      if (acquiringRef.current) return;
      if (reason === "reconnect" && streamIsLive(ownStreamRef.current)) {
        setStream(ownStreamRef.current);
        setCamConn("active");
        return;
      }

      acquiringRef.current = true;
      setCamConn("reconnecting");
      try {
        stopStream(ownStreamRef.current);
        ownStreamRef.current = null;

        const s = await openCameraStream({ facingMode: "user", audio: false });
        ownStreamRef.current = s;
        setStream(s);
        setCamConn("active");
        setFaceStatus(faceDetection ? "unclear" : "ok");
      } catch {
        ownStreamRef.current = null;
        setStream(null);
        setCamConn("unavailable");
        setFaceStatus("unavailable");
        fireAlert("camera_blocked", null);
      } finally {
        acquiringRef.current = false;
      }
    },
    [enabled, externalStream, faceDetection, fireAlert],
  );

  useEffect(() => {
    if (externalStream) {
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
      setStream(externalStream);
      if (streamIsLive(externalStream)) {
        setCamConn("active");
        setFaceStatus((prev) => (prev === "unavailable" ? "unclear" : prev));
      }
      return;
    }
    if (!enabled) {
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
      setStream(null);
      setCamConn("unavailable");
      setFaceStatus("unavailable");
      return;
    }

    void acquireOwnCamera("mount");

    return () => {
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
    };
  }, [enabled, externalStream, acquireOwnCamera, faceDetection]);

  useEffect(() => {
    if (!enabled) return;

    const tryReconnect = () => {
      if (document.visibilityState !== "visible") return;
      const active =
        streamIsLive(ownStreamRef.current) || streamIsLive(stream) || streamIsLive(externalStream);
      const v = videoRef.current;
      if (active) {
        setCamConn("active");
        if (v) {
          if (stream && v.srcObject !== stream) v.srcObject = stream;
          else if (externalStream && v.srcObject !== externalStream) v.srcObject = externalStream;
          void v.play().catch(() => {});
        }
        return;
      }
      setCamConn("reconnecting");
      if (externalStream) {
        onNeedRef.current?.();
      } else {
        void acquireOwnCamera("reconnect");
      }
    };

    const onVis = () => tryReconnect();
    const onFocus = () => tryReconnect();
    const onPageShow = () => tryReconnect();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    const health = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const active =
        streamIsLive(ownStreamRef.current) || streamIsLive(stream) || streamIsLive(externalStream);
      if (!active) {
        setCamConn("reconnecting");
        if (externalStream) onNeedRef.current?.();
        else void acquireOwnCamera("reconnect");
      } else {
        const v = videoRef.current;
        if (v && v.paused) void v.play().catch(() => {});
      }
    }, 5000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(health);
    };
  }, [enabled, externalStream, stream, acquireOwnCamera]);

  useEffect(() => {
    if (!stream || !enabled) return;
    const tracks = stream.getVideoTracks();
    const onEnded = () => {
      setCamConn("reconnecting");
      if (externalStream) onNeedRef.current?.();
      else void acquireOwnCamera("reconnect");
    };
    const onMute = () => {
      if (!streamIsLive(stream)) {
        setCamConn("reconnecting");
        if (externalStream) onNeedRef.current?.();
        else void acquireOwnCamera("reconnect");
      }
    };
    const onUnmute = () => {
      if (streamIsLive(stream)) setCamConn("active");
    };
    for (const tr of tracks) {
      tr.addEventListener("ended", onEnded);
      tr.addEventListener("mute", onMute);
      tr.addEventListener("unmute", onUnmute);
    }
    return () => {
      for (const tr of tracks) {
        tr.removeEventListener("ended", onEnded);
        tr.removeEventListener("mute", onMute);
        tr.removeEventListener("unmute", onUnmute);
      }
    };
  }, [stream, enabled, externalStream, acquireOwnCamera]);

  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && stream) {
        node.srcObject = stream;
        node.muted = true;
        void node.play().catch(() => {});
      }
    },
    [stream],
  );

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      void videoRef.current.play().catch(() => {});
    }
    if (!stream && videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  useEffect(() => {
    if (!stream || !faceDetection || !enabled) {
      setFaceStatus(stream && enabled ? (faceDetection ? "unclear" : "ok") : "unavailable");
      return;
    }

    setFaceStatus((prev) => (prev === "unavailable" ? "unclear" : prev));
    lastStateRef.current = lastStateRef.current === "unavailable" ? "unclear" : lastStateRef.current;

    let cancelled = false;
    let timer: number | undefined;
    let engineReady = false;
    let pending: FaceState | null = null;
    let pendingStreak = 0;
    const CONFIRM: Record<FaceState, number> = {
      ok: 1,
      multi: 4,
      none: 3,
      unclear: 4,
      unavailable: 2,
    };

    const commitState = (next: FaceState, faceCount: number | null) => {
      if (cancelled) return;
      const prev = lastStateRef.current;
      if (prev === next) return;
      setFaceStatus(next);
      lastStateRef.current = next;

      if (next === "ok") {
        faceWarnRef.current = Math.max(0, faceWarnRef.current - 1);
        onSecRef.current?.({ kind: "ok", faceCount, at: new Date().toISOString() });
        return;
      }
      if (!engineReady) return;
      if (next === "unavailable") return;

      faceWarnRef.current += 1;
      if (next === "none") fireAlert("none", faceCount);
      else if (next === "unclear") fireAlert("unclear", faceCount);
      else if (next === "multi") fireAlert("multi", faceCount);
    };

    const proposeState = (next: FaceState, faceCount: number | null) => {
      if (cancelled) return;
      if (next === lastStateRef.current) {
        pending = null;
        pendingStreak = 0;
        return;
      }
      if (pending === next) {
        pendingStreak += 1;
      } else {
        pending = next;
        pendingStreak = 1;
      }
      const need = CONFIRM[next] ?? 2;
      if (pendingStreak >= need) {
        commitState(next, faceCount);
        pending = null;
        pendingStreak = 0;
      }
    };

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      const engine = faceEngineRef.current;
      if (!video || !engine) {
        if (!cancelled) timer = window.setTimeout(() => void tick(), FACE_TICK_MS);
        return;
      }
      if (video.readyState < 2 || video.videoWidth === 0) {
        if (!cancelled) timer = window.setTimeout(() => void tick(), 280);
        return;
      }
      try {
        const n = await engine.count(video);
        if (cancelled) return;
        engineReady = true;
        if (n == null) {
          proposeState("unclear", null);
        } else if (n <= 0) {
          proposeState("none", 0);
        } else if (n === 1) {
          proposeState("ok", 1);
        } else {
          proposeState("multi", n);
        }
      } catch {
        proposeState("unclear", null);
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), FACE_TICK_MS);
    };

    void (async () => {
      const timeoutId = window.setTimeout(() => {
        if (!cancelled && !faceEngineRef.current) {
          setFaceStatus((prev) => (prev === "unavailable" ? "unclear" : prev));
        }
      }, ENGINE_TIMEOUT_MS);

      try {
        const engine = await createFaceEngine();
        window.clearTimeout(timeoutId);
        if (cancelled) {
          engine?.close();
          return;
        }
        if (!engine) {
          setFaceStatus("unclear");
          return;
        }
        faceEngineRef.current = engine;
        setFaceStatus((prev) => (prev === "unavailable" || prev === "unclear" ? "ok" : prev));
        lastStateRef.current =
          lastStateRef.current === "unavailable" || lastStateRef.current === "unclear"
            ? "ok"
            : lastStateRef.current;
        void tick();
      } catch {
        window.clearTimeout(timeoutId);
        if (!cancelled) setFaceStatus("unclear");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      faceEngineRef.current?.close?.();
      faceEngineRef.current = null;
    };
  }, [stream, faceDetection, maxFaceWarnings, enabled, fireAlert]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const d = dragState.current;
      if (!d || e.pointerId !== d.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const el = pipRef.current;
      const w = el?.offsetWidth || 132;
      const h = el?.offsetHeight || 160;
      const next = clampPos(d.originLeft + dx, d.originTop + dy, w, h);
      posRef.current = next;
      setPos(next);
    };

    const onUp = (e: PointerEvent) => {
      const d = dragState.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragState.current = null;
      setDragging(false);
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  function startDrag(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: posRef.current.left,
      originTop: posRef.current.top,
    };
    setDragging(true);
  }

  if (!enabled) return null;

  const reallyLive =
    streamIsLive(stream) || streamIsLive(externalStream) || streamIsLive(ownStreamRef.current);
  const effectiveConn: CamConnState =
    reallyLive && camConn !== "reconnecting"
      ? "active"
      : camConn === "reconnecting"
        ? "reconnecting"
        : reallyLive
          ? "active"
          : camConn;

  const displayFaceStatus: FaceState =
    effectiveConn === "active" && faceStatus === "unavailable" && faceDetection
      ? "unclear"
      : faceStatus;

  const faceLabel =
    effectiveConn === "reconnecting"
      ? "Reconnecting camera…"
      : effectiveConn === "unavailable"
        ? "Camera not available"
        : displayFaceStatus === "multi"
          ? "Multiple faces"
          : displayFaceStatus === "none"
            ? "Face not seen"
            : displayFaceStatus === "ok"
              ? "Monitoring · 1 face"
              : displayFaceStatus === "unavailable"
                ? faceDetection
                  ? "Face check starting…"
                  : "Camera active"
                : "Face unclear";

  const statusDot =
    effectiveConn === "active"
      ? displayFaceStatus === "ok"
        ? "bg-emerald-400"
        : displayFaceStatus === "multi"
          ? "bg-red-400"
          : "bg-amber-400"
      : effectiveConn === "reconnecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-slate-400";

  return (
    <div
      ref={pipRef}
      data-exam-pip
      className={cn(
        "fixed z-[80] w-[132px] overflow-hidden rounded-xl border border-white/20 bg-slate-950 shadow-xl sm:w-[150px]",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{
        left: pos.left,
        top: pos.top,
        touchAction: "none",
        userSelect: "none",
      }}
      onPointerDown={startDrag}
    >
      <div
        className="flex items-center gap-1 bg-black/80 px-2 py-1 text-[10px] font-semibold text-white"
        style={{ touchAction: "none" }}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", statusDot)} />
        <GripHorizontal className="h-3 w-3 opacity-60" />
        <span className="truncate">Camera active</span>
      </div>
      <div className="relative aspect-[4/5] bg-slate-900 pointer-events-none">
        <video
          ref={setVideoNode}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted
        />
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 px-1.5 py-1 text-center text-[9px] font-bold text-white",
            displayFaceStatus === "ok"
              ? "bg-emerald-600/90"
              : displayFaceStatus === "multi"
                ? "bg-red-600/90"
                : "bg-amber-600/90",
          )}
        >
          {faceLabel}
        </div>
      </div>
    </div>
  );
}
