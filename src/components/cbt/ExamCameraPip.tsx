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

  if (!enabled) return null;

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
    >
      <div className="flex items-center gap-1 bg-black/80 px-2 py-1 text-[10px] font-semibold text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <GripHorizontal className="h-3 w-3 opacity-60" />
        <span className="truncate">Camera active</span>
      </div>
      <div className="relative aspect-[4/5] bg-slate-900 pointer-events-none">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted
        />
      </div>
    </div>
  );
}
