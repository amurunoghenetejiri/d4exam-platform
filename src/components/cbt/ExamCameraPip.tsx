import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic as fireHaptic, refreshHapticUnlock, type HapticKind } from "@/lib/haptic";
import { createFaceEngine, type FaceEngine } from "@/lib/face-detector";
import { toast } from "sonner";

type FaceState = "ok" | "none" | "multi" | "unclear" | "unavailable";
type CamConnState = "active" | "reconnecting" | "unavailable";
type SecurityAlertKind = "none" | "multi" | "unclear" | "camera_blocked";

function haptic(kind: SecurityAlertKind) {
  const map: Record<SecurityAlertKind, HapticKind> = {
    none: "none",
    unclear: "unclear",
    multi: "multi",
    camera_blocked: "camera_blocked",
  };
  fireHaptic(map[kind]);
}

const ALERT_COOLDOWN_MS = 2800;
const MULTI_ALERT_COOLDOWN_MS = 1600;

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
  const faceEngineRef = useRef<FaceEngine | null>(null);
  const faceWarnRef = useRef(0);
  const lastAlertRef = useRef(0);
  const lastStateRef = useRef<FaceState>("unavailable");
  const pendingRef = useRef<{ state: FaceState; since: number } | null>(null);
  const STABILITY_MS = 280;
  const ownStreamRef = useRef<MediaStream | null>(null);
  const acquiringRef = useRef(false);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);
  const onSecRef = useRef(onSecurityEvent);
  onSecRef.current = onSecurityEvent;
  const onNeedRef = useRef(onNeedReconnect);
  onNeedRef.current = onNeedReconnect;

  const [pos, setPos] = useState({ left: 4, top: 4 });
  const [faceStatus, setFaceStatus] = useState<FaceState>(faceDetection ? "unclear" : "unavailable");
  const [stream, setStream] = useState<MediaStream | null>(externalStream ?? null);
  const [camConn, setCamConn] = useState<CamConnState>(
    externalStream ? "active" : enabled ? "reconnecting" : "unavailable",
  );
  const [dragging, setDragging] = useState(false);

  const fireAlert = useCallback((kind: SecurityAlertKind, faceCount: number | null) => {
    const now = Date.now();
    const cool = kind === "multi" ? MULTI_ALERT_COOLDOWN_MS : ALERT_COOLDOWN_MS;
    if (now - lastAlertRef.current < cool && kind !== "multi") return;
    // Multi always allowed after short gap so it is never swallowed by a prior "none"
    if (kind === "multi" && now - lastAlertRef.current < 200) return;
    lastAlertRef.current = now;
    try {
      refreshHapticUnlock();
      haptic(kind);
    } catch {
      /* ignore */
    }
    const copy = ALERT_COPY[kind];
    if (copy) {
      try {
        /* Face banners stay in-UI; no bottom toasts during exam */
        void copy;
      } catch {
        /* ignore */
      }
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

        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
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
        onSecRef.current?.({
          kind: "camera_blocked",
          faceCount: null,
          at: new Date().toISOString(),
        });
      } finally {
        acquiringRef.current = false;
      }
    },
    [enabled, externalStream, faceDetection, fireAlert],
  );

  useEffect(() => {
    if (externalStream) {
      setStream(externalStream);
      setCamConn(streamIsLive(externalStream) ? "active" : "unavailable");
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
  }, [enabled, externalStream, acquireOwnCamera]);

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
    const onCbtResume = () => tryReconnect();
    window.addEventListener("d4-cbt-resume", onCbtResume);

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
    }, 3000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("d4-cbt-resume", onCbtResume);
      window.clearInterval(health);
    };
  }, [enabled, externalStream, stream, acquireOwnCamera]);

  useEffect(() => {
    if (!stream || !enabled) return;
    const tracks = stream.getVideoTracks();
    const onEnded = () => {
      setCamConn("reconnecting");
      setFaceStatus("unclear");
      if (externalStream) {
        onNeedRef.current?.();
      } else {
        void acquireOwnCamera("reconnect");
      }
    };
    const onMute = () => {
      const v = videoRef.current;
      if (v) void v.play().catch(() => {});
    };
    const onUnmute = () => {
      setCamConn((c) => (c === "reconnecting" ? "active" : c));
      const v = videoRef.current;
      if (v) void v.play().catch(() => {});
    };
    for (const tr of tracks) {
      tr.addEventListener("ended", onEnded);
      tr.addEventListener("mute", onMute);
      tr.addEventListener("unmute", onUnmute);
    };
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
      setFaceStatus(stream && enabled ? "unclear" : "unavailable");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const applyState = (next: FaceState, faceCount: number | null) => {
      const prev = lastStateRef.current;
      const now = Date.now();
      if (next === "ok") {
        pendingRef.current = null;
        if (prev !== "ok") {
          setFaceStatus("ok");
          lastStateRef.current = "ok";
          faceWarnRef.current = Math.max(0, faceWarnRef.current - 1);
          onSecRef.current?.({ kind: "ok", faceCount, at: new Date().toISOString() });
        }
        return;
      }
      const pend = pendingRef.current;
      if (!pend || pend.state !== next) {
        pendingRef.current = { state: next, since: now };
        return;
      }
      if (now - pend.since < STABILITY_MS) return;
      pendingRef.current = null;
      if (prev === next) {
        // Keep vibrating while violation persists (multi stronger, none softer)
        if (next === "none" || next === "multi") fireAlert(next, faceCount);
        return;
      }
      setFaceStatus(next);
      lastStateRef.current = next;
      faceWarnRef.current += 1;
      if (next === "none") fireAlert("none", faceCount);
      else if (next === "multi") fireAlert("multi", faceCount);
      else if (next === "unclear") fireAlert("unclear", faceCount);
      else if (next === "unavailable") fireAlert("unclear", faceCount);
    };

    let nullStreak = 0;
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
      if (cancelled || !videoRef.current || !faceEngineRef.current) {
        if (!cancelled) timer = window.setTimeout(() => void tick(), 250);
        return;
      }
      try {
        const v = videoRef.current;
        if (v.readyState < 2 || v.videoWidth < 16) {
          if (Date.now() - startedAt > 1000) {
            nullStreak += 1;
            if (nullStreak >= 2) applyState("none", 0);
          }
        } else {
          // Never hang the UI if MediaPipe stalls
          const n = await Promise.race([
            faceEngineRef.current.count(v),
            new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 700)),
          ]);
          if (cancelled) return;
          if (n == null) {
            nullStreak += 1;
            if (nullStreak >= 3) applyState("none", 0);
            else if (nullStreak >= 8) applyState("unclear", null);
          } else {
            nullStreak = 0;
            if (n <= 0) applyState("none", 0);
            else if (n >= 2) applyState("multi", n);
            else applyState("ok", 1);
          }
        }
      } catch {
        if (!cancelled) {
          nullStreak += 1;
          if (nullStreak >= 5) applyState("none", 0);
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(() => void tick(), 120);
      }
    };

    const bootEngine = async () => {
      try {
        await waitVideoReady(3000);
        if (cancelled) return;
        try {
          faceEngineRef.current?.close?.();
        } catch {
          /* ignore */
        }
        faceEngineRef.current = null;
        let engine: FaceEngine | null = null;
        for (let i = 0; i < 6 && !cancelled; i++) {
          engine = await createFaceEngine();
          if (engine) break;
          await new Promise((r) => window.setTimeout(r, 300 * (i + 1)));
        }
        if (cancelled) {
          engine?.close();
          return;
        }
        if (!engine) {
          setFaceStatus("unclear");
          lastStateRef.current = "unclear";
          // Retry boot shortly — do not stay stuck forever
          if (!cancelled) {
            timer = window.setTimeout(() => {
              if (!cancelled) void bootEngine();
            }, 2500);
          }
          return;
        }
        faceEngineRef.current = engine;
        nullStreak = 0;
        setFaceStatus((s) => (s === "unavailable" || s === "unclear" ? "unclear" : s));
        void tick();
      } catch {
        setFaceStatus("unclear");
        lastStateRef.current = "unclear";
      }
    };

    void bootEngine();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      faceEngineRef.current?.close?.();
      faceEngineRef.current = null;
    };
  }, [stream, faceDetection, maxFaceWarnings, enabled, fireAlert]);

  // When user returns to the exam tab/app, force face engine + video back to life
  useEffect(() => {
    if (!enabled || !faceDetection) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const v = videoRef.current;
      if (v && stream) {
        try {
          if (v.srcObject !== stream) v.srcObject = stream;
          v.muted = true;
          void v.play().catch(() => {});
        } catch { /* ignore */ }
      }
      // Nudge status so UI is not stuck on "Detecting…" forever
      setFaceStatus((s) => (s === "unavailable" ? "unclear" : s));
      // Soft reconnect request if stream is dead
      if (!streamIsLive(stream) && !streamIsLive(externalStream)) {
        onNeedRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [enabled, faceDetection, stream, externalStream]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const d = dragState.current;
      if (!d || e.pointerId !== d.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const edge = 2;
      const el = document.querySelector("[data-exam-pip]") as HTMLElement | null;
      const w = el?.offsetWidth || 120;
      const h = el?.offsetHeight || 150;
      const maxL = Math.max(edge, window.innerWidth - w - edge);
      const maxT = Math.max(edge, window.innerHeight - h - edge);
      setPos({
        left: Math.min(maxL, Math.max(edge, d.originLeft + dx)),
        top: Math.min(maxT, Math.max(edge, d.originTop + dy)),
      });
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

  if (!enabled) return null;

  const faceLabel =
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
                  : "Detecting face…";

  const statusDot =
    camConn === "active"
      ? "bg-emerald-400"
      : camConn === "reconnecting"
        ? "bg-amber-400"
        : "bg-red-500";

  return (
    <div
      data-exam-pip
      className="fixed z-[100] w-[112px] touch-none overflow-hidden rounded-xl border-2 border-white/90 bg-black shadow-2xl sm:w-[128px]"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        dragState.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          originLeft: pos.left,
          originTop: pos.top,
        };
        setDragging(true);
      }}
    >
      <div className="flex cursor-grab items-center gap-0.5 bg-black/80 px-1.5 py-1 active:cursor-grabbing">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot)} aria-hidden />
        <GripVertical className="h-3.5 w-3.5 text-white/80" />
        <span className="truncate text-[9px] font-semibold text-white/90">
          {camConn === "active"
            ? "Camera active"
            : camConn === "reconnecting"
              ? "Reconnecting…"
              : "Camera off"}
        </span>
      </div>
      {stream ? (
        <video
          ref={setVideoNode}
          className="aspect-square w-full scale-x-[-1] bg-black object-cover pointer-events-none"
          autoPlay
          playsInline
          muted
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-slate-900 px-1 text-center text-[9px] font-semibold text-white/80">
          {camConn === "reconnecting" ? "Reconnecting camera…" : "Allow camera access"}
        </div>
      )}
      <div
        className={cn(
          "px-1 py-0.5 text-center text-[9px] font-bold leading-tight text-white",
          camConn === "reconnecting" && "bg-amber-600",
          camConn === "unavailable" && "bg-red-700",
          camConn === "active" && faceStatus === "multi" && "bg-red-600",
          camConn === "active" && faceStatus === "none" && "bg-amber-600",
          camConn === "active" && faceStatus === "unclear" && "bg-amber-500",
          camConn === "active" && faceStatus === "ok" && "bg-emerald-600",
          camConn === "active" && faceStatus === "unavailable" && "bg-red-700",
        )}
      >
        {faceLabel}
      </div>
    </div>
  );
}
