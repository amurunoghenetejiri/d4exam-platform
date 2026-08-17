import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic as fireHaptic, type HapticKind } from "@/lib/haptic";
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

const ALERT_COOLDOWN_MS = 2500;

const ALERT_COPY: Record<
  SecurityAlertKind,
  { message: string; toastId: string; level: "warning" | "error" }
> = {
  none: {
    message: "Face not detected. Please position your face in the camera.",
    toastId: "cbt-face-none",
    level: "error",
  },
  multi: {
    message: "Multiple faces detected. Only the candidate should be visible.",
    toastId: "cbt-face-multi",
    level: "error",
  },
  unclear: {
    message: "Face not clear. Improve lighting and face the camera clearly.",
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
}: {
  enabled?: boolean;
  faceDetection?: boolean;
  maxFaceWarnings?: number;
  stream?: MediaStream | null;
  onSecurityEvent?: (event: FaceSecurityEvent) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
  const onSecRef = useRef(onSecurityEvent);
  onSecRef.current = onSecurityEvent;

  const [pos, setPos] = useState({ left: 4, top: 4 });
  const [faceStatus, setFaceStatus] = useState<FaceState>("unavailable");
  const [stream, setStream] = useState<MediaStream | null>(externalStream ?? null);
  const [camConn, setCamConn] = useState<CamConnState>(
    externalStream ? "active" : enabled ? "reconnecting" : "unavailable",
  );
  const [dragging, setDragging] = useState(false);

  const fireAlert = useCallback((kind: SecurityAlertKind, faceCount: number | null) => {
    const now = Date.now();
    if (now - lastAlertRef.current < ALERT_COOLDOWN_MS) return;
    lastAlertRef.current = now;

    // Vibration first (must not depend on toast)
    try {
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
      acquiringRef.current = true;
      setCamConn("reconnecting");
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!enabled) {
          stopStream(s);
          return;
        }
        stopStream(ownStreamRef.current);
        ownStreamRef.current = s;
        setStream(s);
        setCamConn("active");
        if (reason === "reconnect") {
          toast.success("Camera reconnected", { id: "cbt-cam-reconnect", duration: 2200 });
        }
      } catch {
        setCamConn("unavailable");
        setStream(null);
        fireAlert("camera_blocked", null);
      } finally {
        acquiringRef.current = false;
      }
    },
    [enabled, externalStream, fireAlert],
  );

  useEffect(() => {
    if (externalStream) {
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
      setStream(externalStream);
      setCamConn(streamIsLive(externalStream) ? "active" : "reconnecting");
      return;
    }
    if (!enabled) {
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
      setStream(null);
      setCamConn("unavailable");
      return;
    }
    void acquireOwnCamera("mount");
    return () => {
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
    };
  }, [enabled, externalStream, acquireOwnCamera]);

  useEffect(() => {
    if (externalStream) {
      setStream(externalStream);
      setCamConn(streamIsLive(externalStream) ? "active" : "reconnecting");
    }
  }, [externalStream]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!stream) {
      v.srcObject = null;
      return;
    }
    v.srcObject = stream;
    void v.play().catch(() => {});
  }, [stream]);

  useEffect(() => {
    if (!enabled) return;
    if (externalStream) return;
    if (!stream) return;

    const onEnded = () => {
      setCamConn("reconnecting");
      fireAlert("camera_blocked", null);
      void acquireOwnCamera("reconnect");
    };
    const onMute = () => {
      if (!streamIsLive(stream)) {
        setCamConn("reconnecting");
        fireAlert("camera_blocked", null);
        void acquireOwnCamera("reconnect");
      }
    };

    for (const t of stream.getVideoTracks()) {
      t.addEventListener("ended", onEnded);
      t.addEventListener("mute", onMute);
    }
    const poll = window.setInterval(() => {
      if (!streamIsLive(stream)) {
        setCamConn("reconnecting");
        void acquireOwnCamera("reconnect");
      } else {
        setCamConn("active");
      }
    }, 4000);

    return () => {
      for (const t of stream.getVideoTracks()) {
        t.removeEventListener("ended", onEnded);
        t.removeEventListener("mute", onMute);
      }
      window.clearInterval(poll);
    };
  }, [stream, enabled, externalStream, fireAlert, acquireOwnCamera]);

  useEffect(() => {
    if (!stream || !faceDetection || !enabled) {
      setFaceStatus(stream && enabled ? "unclear" : "unavailable");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const applyState = (next: FaceState, faceCount: number | null) => {
      const prev = lastStateRef.current;
      setFaceStatus(next);
      lastStateRef.current = next;

      if (next === "ok") {
        faceWarnRef.current = Math.max(0, faceWarnRef.current - 1);
        if (prev !== "ok") {
          onSecRef.current?.({ kind: "ok", faceCount, at: new Date().toISOString() });
        }
        return;
      }

      faceWarnRef.current += 1;
      if (next === "none") fireAlert("none", faceCount);
      else if (next === "multi") fireAlert("multi", faceCount);
      else if (next === "unclear") fireAlert("unclear", faceCount);
      else if (next === "unavailable") fireAlert("camera_blocked", faceCount);
    };

    const tick = async () => {
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
      if (!cancelled) timer = window.setTimeout(() => void tick(), 1800);
    };

    void (async () => {
      try {
        const engine = await createFaceEngine();
        if (cancelled) {
          engine?.close();
          return;
        }
        if (!engine) {
          setFaceStatus("unavailable");
          fireAlert("camera_blocked", null);
          return;
        }
        faceEngineRef.current = engine;
        void tick();
      } catch {
        setFaceStatus("unavailable");
        fireAlert("camera_blocked", null);
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
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const left = Math.max(0, Math.min(window.innerWidth - 120, d.originLeft + dx));
      const top = Math.max(0, Math.min(window.innerHeight - 160, d.originTop + dy));
      setPos({ left, top });
    };
    const onUp = (e: PointerEvent) => {
      const d = dragState.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragState.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  if (!enabled) return null;

  const badge =
    camConn === "unavailable"
      ? { text: "Camera off", className: "bg-red-600" }
      : camConn === "reconnecting"
        ? { text: "Reconnecting…", className: "bg-amber-500" }
        : faceStatus === "ok"
          ? { text: "Face OK", className: "bg-emerald-600" }
          : faceStatus === "none"
            ? { text: "No face", className: "bg-red-600" }
            : faceStatus === "multi"
              ? { text: "Multi face", className: "bg-red-600" }
              : { text: "Checking…", className: "bg-slate-600" };

  return (
    <div
      className="fixed z-[90] w-[112px] overflow-hidden rounded-xl border-2 border-white/80 bg-slate-900 shadow-xl sm:w-[128px]"
      style={{ left: pos.left, top: pos.top }}
    >
      <div
        className="flex cursor-grab items-center gap-1 bg-black/50 px-1.5 py-0.5 active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
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
        <GripVertical className="h-3 w-3 text-white/70" />
        <span className={cn("rounded px-1 text-[9px] font-bold text-white", badge.className)}>{badge.text}</span>
      </div>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="aspect-[3/4] w-full scale-x-[-1] object-cover"
      />
    </div>
  );
}
