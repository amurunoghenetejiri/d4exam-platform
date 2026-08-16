import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { createFaceEngine, type FaceEngine } from "@/lib/face-detector";
import { toast } from "sonner";

type FaceState = "ok" | "none" | "multi" | "unclear" | "unavailable";

type SecurityAlertKind = "none" | "multi" | "unclear" | "camera_blocked";

/** Browser Vibration API — no-op when unsupported (desktop Safari, some desktops). */
function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

/** Distinct short patterns per security warning (ms on/off). */
const VIBRATE_PATTERNS: Record<SecurityAlertKind, number | number[]> = {
  none: [100, 50, 100],
  unclear: [80, 40, 80],
  multi: [180, 70, 180, 70, 180],
  camera_blocked: [250, 100, 250],
};

function haptic(kind: SecurityAlertKind) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(VIBRATE_PATTERNS[kind]);
  } catch {
    /* permission / policy blocked — visual toast still works */
  }
}

const ALERT_COOLDOWN_MS = 4000;

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
  /** Optional hook for exam monitoring / audit (parent may persist). */
  onSecurityEvent?: (event: FaceSecurityEvent) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceEngineRef = useRef<FaceEngine | null>(null);
  const faceWarnRef = useRef(0);
  const lastAlertRef = useRef(0);
  const lastStateRef = useRef<FaceState>("unavailable");
  const ownStreamRef = useRef<MediaStream | null>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);
  const onSecRef = useRef(onSecurityEvent);
  onSecRef.current = onSecurityEvent;

  const [pos, setPos] = useState({ left: 16, top: 16 });
  const [faceStatus, setFaceStatus] = useState<FaceState>("unavailable");
  const [stream, setStream] = useState<MediaStream | null>(externalStream ?? null);
  const [dragging, setDragging] = useState(false);

  const fireAlert = useCallback((kind: SecurityAlertKind, faceCount: number | null) => {
    const now = Date.now();
    // Cooldown: avoid continuous vibrate every poll tick
    if (now - lastAlertRef.current < ALERT_COOLDOWN_MS) return;
    lastAlertRef.current = now;

    const copy = ALERT_COPY[kind];
    if (copy.level === "error") {
      toast.error(copy.message, { id: copy.toastId, duration: 4000 });
    } else {
      toast.warning(copy.message, { id: copy.toastId, duration: 4000 });
    }
    haptic(kind);
    onSecRef.current?.({
      kind,
      faceCount,
      at: new Date().toISOString(),
    });
  }, []);

  // Camera acquire / release
  useEffect(() => {
    if (externalStream) {
      setStream(externalStream);
      return;
    }
    if (!enabled) {
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
      setStream(null);
      setFaceStatus("unavailable");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          stopStream(s);
          return;
        }
        ownStreamRef.current = s;
        setStream(s);
      } catch {
        setFaceStatus("unavailable");
        setStream(null);
        fireAlert("camera_blocked", null);
      }
    })();
    return () => {
      cancelled = true;
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
    };
  }, [enabled, externalStream, fireAlert]);

  // Stream ended / track muted → camera blocked
  useEffect(() => {
    if (!stream || !enabled) return;
    const tracks = stream.getVideoTracks();
    const onEnded = () => {
      setFaceStatus("unavailable");
      fireAlert("camera_blocked", null);
    };
    const onMute = () => {
      setFaceStatus("unavailable");
      fireAlert("camera_blocked", null);
    };
    for (const t of tracks) {
      t.addEventListener("ended", onEnded);
      t.addEventListener("mute", onMute);
    }
    return () => {
      for (const t of tracks) {
        t.removeEventListener("ended", onEnded);
        t.removeEventListener("mute", onMute);
      }
    };
  }, [stream, enabled, fireAlert]);

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

  // Real face-detection loop → status → toast + haptic
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
        // null = video not ready / detection failed → treat as unclear (out of frame)
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

  // Drag across screen
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const d = dragState.current;
      if (!d || e.pointerId !== d.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const w = 160;
      const h = 180;
      const maxL = Math.max(8, window.innerWidth - w - 8);
      const maxT = Math.max(8, window.innerHeight - h - 8);
      setPos({
        left: Math.min(maxL, Math.max(8, d.originLeft + dx)),
        top: Math.min(maxT, Math.max(8, d.originTop + dy)),
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

  if (!enabled || !stream) return null;

  const faceLabel =
    faceStatus === "multi"
      ? "Multiple faces"
      : faceStatus === "none"
        ? "Face not seen"
        : faceStatus === "ok"
          ? "Monitoring · 1 face"
          : faceStatus === "unavailable"
            ? "Camera blocked"
            : "Face unclear";

  return (
    <div
      className="fixed z-[100] w-[132px] touch-none overflow-hidden rounded-xl border-2 border-white/80 bg-black shadow-2xl sm:w-[160px]"
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
      <div className="flex cursor-grab items-center gap-1 bg-black/80 px-2 py-1.5 active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5 text-white/80" />
        <span className="text-[10px] font-semibold text-white/90">Drag to move</span>
      </div>
      <video
        ref={setVideoNode}
        className="aspect-[4/3] w-full scale-x-[-1] bg-black object-cover pointer-events-none"
        autoPlay
        playsInline
        muted
      />
      <div
        className={cn(
          "px-2 py-1 text-center text-[10px] font-bold text-white",
          faceStatus === "multi" && "bg-red-600",
          faceStatus === "none" && "bg-amber-600",
          faceStatus === "unclear" && "bg-amber-500",
          faceStatus === "ok" && "bg-emerald-600",
          faceStatus === "unavailable" && "bg-red-700",
        )}
      >
        {faceLabel}
      </div>
    </div>
  );
}
