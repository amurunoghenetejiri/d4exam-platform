import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { createFaceEngine, type FaceEngine } from "@/lib/face-detector";
import { toast } from "sonner";

type FaceState = "ok" | "none" | "multi" | "unknown" | "unavailable";

function vibrate(pattern: number | number[] = 200) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore — not supported on all devices / browsers */
  }
}

export function ExamCameraPip({
  enabled = true,
  faceDetection = false,
  maxFaceWarnings = 3,
  stream: externalStream,
}: {
  enabled?: boolean;
  faceDetection?: boolean;
  maxFaceWarnings?: number;
  stream?: MediaStream | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceEngineRef = useRef<FaceEngine | null>(null);
  const faceWarnRef = useRef(0);
  const lastAlertRef = useRef(0);
  const ownStreamRef = useRef<MediaStream | null>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);
  const [pos, setPos] = useState({ left: 16, top: 16 });
  const [faceStatus, setFaceStatus] = useState<FaceState>("unknown");
  const [stream, setStream] = useState<MediaStream | null>(externalStream ?? null);
  const [dragging, setDragging] = useState(false);

  // Acquire own camera if no external stream and enabled
  useEffect(() => {
    if (externalStream) {
      setStream(externalStream);
      return;
    }
    if (!enabled) {
      setStream(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        ownStreamRef.current = s;
        setStream(s);
      } catch {
        setFaceStatus("unavailable");
        setStream(null);
      }
    })();
    return () => {
      cancelled = true;
      if (ownStreamRef.current) {
        ownStreamRef.current.getTracks().forEach((t) => t.stop());
        ownStreamRef.current = null;
      }
    };
  }, [enabled, externalStream]);

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
  }, [stream]);

  // Face detection loop + alerts
  useEffect(() => {
    if (!stream || !faceDetection) {
      setFaceStatus(stream ? "unknown" : "unavailable");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const alertFace = (kind: "none" | "multi") => {
      const now = Date.now();
      // throttle alerts to once every 4s
      if (now - lastAlertRef.current < 4000) return;
      lastAlertRef.current = now;
      if (kind === "none") {
        toast.warning("Face not detected — centre your face in the camera", {
          id: "face-none",
          duration: 3500,
        });
        vibrate([120, 60, 120]);
      } else {
        toast.error("Multiple faces detected — only one person should be visible", {
          id: "face-multi",
          duration: 3500,
        });
        vibrate([200, 80, 200, 80, 200]);
      }
    };

    const tick = async () => {
      if (cancelled || !videoRef.current || !faceEngineRef.current) return;
      try {
        const n = await faceEngineRef.current.count(videoRef.current);
        if (cancelled) return;
        if (n <= 0) {
          setFaceStatus("none");
          faceWarnRef.current += 1;
          alertFace("none");
        } else if (n > 1) {
          setFaceStatus("multi");
          faceWarnRef.current += 1;
          alertFace("multi");
        } else {
          setFaceStatus("ok");
          faceWarnRef.current = Math.max(0, faceWarnRef.current - 1);
        }
      } catch {
        setFaceStatus("unknown");
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), 1800);
    };

    void (async () => {
      try {
        faceEngineRef.current = await createFaceEngine();
        void tick();
      } catch {
        setFaceStatus("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      faceEngineRef.current?.close?.();
      faceEngineRef.current = null;
    };
  }, [stream, faceDetection, maxFaceWarnings]);

  // Document-level pointer handlers while dragging (reliable across the screen)
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
            ? "Camera off"
            : "Live camera";

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
          faceStatus === "ok" && "bg-emerald-600",
          (faceStatus === "unknown" || faceStatus === "unavailable") && "bg-primary",
        )}
      >
        {faceLabel}
      </div>
    </div>
  );
}
