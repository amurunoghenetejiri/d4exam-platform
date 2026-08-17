/**
 * Near-live exam camera streaming for officers.
 * Uses low-rate JPEG frames over Supabase Realtime Broadcast (no TURN server required).
 * Streaming stops when the student exam ends or the camera is closed.
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
export const LIVE_CAM_FRAME_INTERVAL_MS = 1200;
export const LIVE_CAM_STALE_MS = 8_000;

export function liveCamChannelName(schoolId: string): string {
  return `live-cam:${schoolId}`;
}

/** Capture a small JPEG data-URL from an active MediaStream (for broadcast). */
export async function captureJpegFromStream(
  stream: MediaStream,
  opts?: { maxWidth?: number; quality?: number },
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const tracks = stream.getVideoTracks();
  if (!tracks.some((t) => t.readyState === "live" && t.enabled !== false)) return null;

  const maxWidth = opts?.maxWidth ?? 320;
  const quality = opts?.quality ?? 0.42;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  try {
    await video.play();
  } catch {
    video.srcObject = null;
    return null;
  }

  // Wait briefly for dimensions if needed
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => {
      const onMeta = () => {
        video.removeEventListener("loadedmetadata", onMeta);
        resolve();
      };
      video.addEventListener("loadedmetadata", onMeta);
      window.setTimeout(() => resolve(), 400);
    });
  }

  const vw = video.videoWidth || 320;
  const vh = video.videoHeight || 240;
  if (vw < 8 || vh < 8) {
    video.srcObject = null;
    return null;
  }

  const scale = Math.min(1, maxWidth / vw);
  const w = Math.max(8, Math.round(vw * scale));
  const h = Math.max(8, Math.round(vh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    video.srcObject = null;
    return null;
  }
  // Mirror like the student PIP
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  video.srcObject = null;

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
      if (stopped || !frame || !channel) return;
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
      await channel.send({
        type: "broadcast",
        event: LIVE_CAM_EVENT,
        payload,
      });
    } catch (e) {
      console.warn("[live-cam] publish failed", e);
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

  channel.on("broadcast", { event: LIVE_CAM_EVENT }, ({ payload }) => {
    const p = payload as LiveCamFramePayload;
    if (!p?.attemptId || !p?.frame) return;
    opts.onFrame(p);
  });

  void channel.subscribe();

  return {
    stop: () => {
      void supabase.removeChannel(channel);
    },
  };
}

export function isLiveCamFrameFresh(ts: number | null | undefined, now = Date.now()): boolean {
  if (ts == null) return false;
  return now - ts <= LIVE_CAM_STALE_MS;
}
