import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { createFaceEngine, type FaceEngine } from "@/lib/face-detector";

type FaceState = "ok" | "none" | "multi" | "unknown" | "unavailable";

export function ExamCameraPip({
  stream,
  faceDetection,
  maxFaceWarnings,
}: {
  stream: MediaStream | null;
  faceDetection: boolean;
  maxFaceWarnings: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceEngineRef = useRef<FaceEngine | null>(null);
  const faceWarnRef = useRef(0);
  const dragState = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const [pip, setPip] = useState({ x: 16, y: 16 });
  const [faceStatus, setFaceStatus] = useState<FaceState>("unknown");

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

  useEffect(() => {
    if (!stream || !faceDetection) {
      setFaceStatus(stream ? "unknown" : "unavailable");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      if (cancelled || !videoRef.current || !faceEngineRef.current) return;
      try {
        const n = await faceEngineRef.current.count(videoRef.current);
        if (cancelled) return;
        if (n <= 0) {
          setFaceStatus("none");
          faceWarnRef.current += 1;
        } else if (n > 1) {
          setFaceStatus("multi");
          faceWarnRef.current += 1;
        } else {
          setFaceStatus("ok");
          faceWarnRef.current = Math.max(0, faceWarnRef.current - 1);
        }
      } catch {
        setFaceStatus("unknown");
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), 2000);
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

  if (!stream) return null;

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
      className="fixed z-50 w-[132px] overflow-hidden rounded-xl border-2 border-white/80 bg-black shadow-2xl sm:w-[160px]"
      style={{ right: pip.x, bottom: pip.y }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        dragState.current = { ox: e.clientX, oy: e.clientY, px: pip.x, py: pip.y };
      }}
      onPointerMove={(e) => {
        if (!dragState.current) return;
        const dx = dragState.current.ox - e.clientX;
        const dy = dragState.current.oy - e.clientY;
        setPip({
          x: Math.max(8, Math.min(window.innerWidth - 140, dragState.current.px + dx)),
          y: Math.max(8, Math.min(window.innerHeight - 160, dragState.current.py + dy)),
        });
      }}
      onPointerUp={() => {
        dragState.current = null;
      }}
      onPointerCancel={() => {
        dragState.current = null;
      }}
    >
      <div className="flex cursor-grab items-center gap-1 bg-black/70 px-2 py-1 active:cursor-grabbing">
        <GripVertical className="h-3 w-3 text-white/70" />
        <span className="text-[10px] font-semibold text-white/80">Drag</span>
      </div>
      <video
        ref={setVideoNode}
        className="aspect-[4/3] w-full scale-x-[-1] bg-black object-cover"
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
