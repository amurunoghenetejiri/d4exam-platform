import { useCallback, useEffect, useRef, useState } from "react";
import { openCameraStream } from "@/native/cameraService";
import { toast } from "sonner";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaceSecurityEvent = {
  kind: "none" | "multi" | "unclear" | "camera_blocked" | "ok";
  faceCount: number | null;
  at: string;
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
  const onNeedRef = useRef(onNeedReconnect);
  onNeedRef.current = onNeedReconnect;

  const [pos, setPos] = useState({ left: 4, top: 4 });
  const [stream, setStream] = useState<MediaStream | null>(externalStream ?? null);
  const [camConn, setCamConn] = useState<"active" | "reconnecting" | "unavailable">(
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
      } catch {
        ownStreamRef.current = null;
        setStream(null);
        setCamConn("unavailable");
        toast.error("Camera view blocked. Please check your camera.", {
          id: "cbt-cam-blocked",
          duration: 3200,
        });
        onSecurityEvent?.({
          kind: "camera_blocked",
          faceCount: null,
          at: new Date().toISOString(),
        });
      } finally {
        acquiringRef.current = false;
      }
    },
    [enabled, externalStream, onSecurityEvent],
  );

  useEffect(() => {
    if (externalStream) {
      stopStream(ownStreamRef.current);
      ownStreamRef.current = null;
      setStream(externalStream);
      if (streamIsLive(externalStream)) setCamConn("active");
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
    if (!enabled) return;
    const tryReconnect = () => {
      if (document.visibilityState !== "visible") return;
      const active =
        streamIsLive(ownStreamRef.current) || streamIsLive(stream) || streamIsLive(externalStream);
      if (active) {
        setCamConn("active");
        return;
      }
      setCamConn("reconnecting");
      if (externalStream) onNeedRef.current?.();
      else void acquireOwnCamera("reconnect");
    };
    document.addEventListener("visibilitychange", tryReconnect);
    window.addEventListener("focus", tryReconnect);
    const health = window.setInterval(tryReconnect, 5000);
    return () => {
      document.removeEventListener("visibilitychange", tryReconnect);
      window.removeEventListener("focus", tryReconnect);
      window.clearInterval(health);
    };
  }, [enabled, externalStream, stream, acquireOwnCamera]);

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
    if (!stream && videoRef.current) videoRef.current.srcObject = null;
  }, [stream]);

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
  const effectiveConn =
    reallyLive && camConn !== "reconnecting"
      ? "active"
      : camConn === "reconnecting"
        ? "reconnecting"
        : reallyLive
          ? "active"
          : camConn;

  const faceLabel =
    effectiveConn === "reconnecting"
      ? "Reconnecting camera…"
      : effectiveConn === "unavailable"
        ? "Camera not available"
        : faceDetection
          ? "Monitoring · camera active"
          : "Camera active";

  const statusDot =
    effectiveConn === "active"
      ? "bg-emerald-400"
      : effectiveConn === "reconnecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-slate-400";

  return (
    <div
      ref={pipRef}
      data-exam-pip
      className={cn(
        "fixed z-[80] w-[min(30vw,7.25rem)] overflow-hidden rounded-xl border border-white/20 bg-slate-950 shadow-xl sm:w-[7.5rem]",
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
        <div className="absolute inset-x-0 bottom-0 bg-emerald-600/90 px-1.5 py-1 text-center text-[9px] font-bold text-white">
          {faceLabel}
        </div>
      </div>
    </div>
  );
}
