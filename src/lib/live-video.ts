/**
 * Near-live exam camera streaming for officers.
 * Uses low-rate JPEG frames over Supabase Realtime Broadcast (no TURN server required).
 * Streaming stops when the student exam ends or the camera is closed.
 *
 * Performance: reuses one hidden <video> + canvas so frames do not lag/skip as badly.
 */

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type LiveCamFramePayload = {
  attemptId: string;
  studentId: string;
  examId: string;
  frame: string; // data:image/jpeg;base64,...
  ts: number;
  faceStatus?: string;
  cameraActive?: boolean;
};

export const LIVE_CAM_EVENT = "frame";
/** ~2 fps — stable on mobile without flooding Realtime */
export const LIVE_CAM_FRAME_INTERVAL_MS = 900;
export const LIVE_CAM_STALE_MS = 6_000;

export function liveCamChannelName(schoolId: string): string {
  return `live-cam:${schoolId}`;
}

/** Persistent elements so we do not create/destroy video every frame (major lag source). */
let sharedVideo: HTMLVideoElement | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;

function getSharedVideo(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  if (!sharedVideo) {
    sharedVideo = document.createElement("video");
    sharedVideo.muted = true;
    sharedVideo.playsInline = true;
    sharedVideo.setAttribute("playsinline", "true");
    sharedVideo.style.position = "fixed";
    sharedVideo.style.left = "-9999px";
    sharedVideo.style.width = "1px";
    sharedVideo.style.height = "1px";
    sharedVideo.style.opacity = "0";
    sharedVideo.style.pointerEvents = "none";
    try {
      document.body.appendChild(sharedVideo);
    } catch {
      /* SSR / no body */
    }
  }
  return sharedVideo;
}

function getSharedCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
  }
  return sharedCanvas;
}

/** Capture a small JPEG data-URL from an active MediaStream (for broadcast). */
export async function captureJpegFromStream(
  stream: MediaStream,
  opts?: { maxWidth?: number; quality?: number },
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const tracks = stream.getVideoTracks();
  if (!tracks.some((t) => t.readyState === "live" && t.enabled !== false)) return null;

  const maxWidth = opts?.maxWidth ?? 240;
  const quality = opts?.quality ?? 0.38;

  const video = getSharedVideo();
  const canvas = getSharedCanvas();
  if (!video || !canvas) return null;

  // Only re-bind when stream identity changes
  if (video.srcObject !== stream) {
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      return null;
    }
    if (!video.videoWidth) {
      await new Promise<void>((resolve) => {
        const onMeta = () => {
          video.removeEventListener("loadedmetadata", onMeta);
          resolve();
        };
        video.addEventListener("loadedmetadata", onMeta);
        window.setTimeout(() => resolve(), 250);
      });
    }
  }

  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (vw < 8 || vh < 8) return null;

  const scale = Math.min(1, maxWidth / vw);
  const w = Math.max(8, Math.round(vw * scale));
  const h = Math.max(8, Math.round(vh * scale));

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  try {
    ctx.drawImage(video, 0, 0, w, h);
  } catch {
    ctx.restore();
    return null;
  }
  ctx.restore();

  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

export type LiveCamPublisher = {
  stop: () => void;
};

/**
 * Publish camera frames while the exam is active.
 * Call stop() when the exam ends or the camera is closed — streaming stops immediately.
 */
export function startLiveCamPublisher(opts: {
  schoolId: string;
  attemptId: string;
  studentId: string;
  examId: string;
  getStream: () => MediaStream | null;
  getFaceMeta?: () => { faceStatus?: string; cameraActive?: boolean };
  intervalMs?: number;
}): LiveCamPublisher {
  const intervalMs = opts.intervalMs ?? LIVE_CAM_FRAME_INTERVAL_MS;
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let publishing = false;
  let consecutiveFails = 0;

  const channelName = liveCamChannelName(opts.schoolId);
  channel = supabase.channel(channelName, {
    config: { broadcast: { ack: false, self: false } },
  });

  const sendFrame = async () => {
    if (stopped || publishing) return;
    const stream = opts.getStream();
    if (!stream) return;
    publishing = true;
    try {
      const frame = await captureJpegFromStream(stream);
      if (stopped || !frame || !channel) {
        consecutiveFails += 1;
        return;
      }
      consecutiveFails = 0;
      const meta = opts.getFaceMeta?.() ?? {};
      const payload: LiveCamFramePayload = {
        attemptId: opts.attemptId,
        studentId: opts.studentId,
        examId: opts.examId,
        frame,
        ts: Date.now(),
        faceStatus: meta.faceStatus,
        cameraActive: meta.cameraActive !== false,
      };
      // fire-and-forget — do not await ack (keeps student timer smooth)
      void channel.send({
        type: "broadcast",
        event: LIVE_CAM_EVENT,
        payload,
      });
    } catch (e) {
      consecutiveFails += 1;
      if (consecutiveFails <= 2) console.warn("[live-cam] publish failed", e);
    } finally {
      publishing = false;
    }
  };

  void channel.subscribe((status) => {
    if (status === "SUBSCRIBED" && !stopped) {
      void sendFrame();
      timer = setInterval(() => void sendFrame(), intervalMs);
    }
  });

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
      // Detach stream from shared video so camera can fully stop
      if (sharedVideo && sharedVideo.srcObject) {
        try {
          sharedVideo.srcObject = null;
        } catch {
          /* ignore */
        }
      }
    },
  };
}

export type LiveCamSubscriber = {
  stop: () => void;
};

/**
 * Officer side: receive near-live frames for a school.
 * onFrame is called for each broadcast; UI should drop frames when attempt is no longer in progress.
 */
export function startLiveCamSubscriber(opts: {
  schoolId: string;
  onFrame: (payload: LiveCamFramePayload) => void;
}): LiveCamSubscriber {
  const channelName = liveCamChannelName(opts.schoolId);
  const channel = supabase.channel(channelName, {
    config: { broadcast: { self: false } },
  });

  // Drop super-stale frames so UI does not jump backward in time
  let lastTsByAttempt = new Map<string, number>();

  channel.on("broadcast", { event: LIVE_CAM_EVENT }, ({ payload }) => {
    const p = payload as LiveCamFramePayload;
    if (!p?.attemptId || !p?.frame) return;
    const prev = lastTsByAttempt.get(p.attemptId) ?? 0;
    if (p.ts && p.ts < prev - 500) return; // ignore out-of-order old frames
    if (p.ts) lastTsByAttempt.set(p.attemptId, p.ts);
    opts.onFrame(p);
  });

  void channel.subscribe();

  return {
    stop: () => {
      lastTsByAttempt.clear();
      void supabase.removeChannel(channel);
    },
  };
}

export function isLiveCamFrameFresh(ts: number | null | undefined, now = Date.now()): boolean {
  if (ts == null) return false;
  return now - ts <= LIVE_CAM_STALE_MS;
}
