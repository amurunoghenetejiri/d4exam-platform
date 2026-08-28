/**
 * Live camera + screen JPEG frame publish/subscribe over Supabase Realtime broadcast.
 * Camera frames are mirrored (selfie); screen frames are not.
 * Android native screen uses MediaProjection JPEGs directly when available.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { awaitLatestNativeScreenJpeg, getLatestNativeScreenJpeg } from "@/lib/screen-share";

let sharedVideo: HTMLVideoElement | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;

function getSharedVideo(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  if (!sharedVideo) {
    sharedVideo = document.createElement("video");
    sharedVideo.muted = true;
    sharedVideo.playsInline = true;
    sharedVideo.setAttribute("playsinline", "true");
    sharedVideo.setAttribute("webkit-playsinline", "true");
  }
  return sharedVideo;
}

function getSharedCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
  return sharedCanvas;
}

export async function captureJpegFromStream(
  stream: MediaStream,
  opts?: { maxWidth?: number; quality?: number; mirror?: boolean },
): Promise<string | null> {
  const tracks = stream.getVideoTracks();
  if (!tracks.some((t) => t.readyState === "live" && t.enabled !== false)) return null;

  const maxWidth = opts?.maxWidth ?? 360;
  const quality = opts?.quality ?? 0.52;
  const mirror = opts?.mirror !== false;

  const video = getSharedVideo();
  const canvas = getSharedCanvas();
  if (!video || !canvas) return null;

  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  try {
    if (video.paused) await video.play();
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
      window.setTimeout(() => resolve(), 300);
    });
  }

  const t0 = video.currentTime;
  await new Promise((r) => window.setTimeout(r, 40));
  if (video.readyState >= 2 && video.currentTime === t0 && !video.paused) {
    try {
      video.srcObject = stream;
      await video.play();
    } catch {
      return null;
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
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
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

export type LiveCamPublisher = { stop: () => void };

export const LIVE_CAM_EVENT = "cam-frame";
export const LIVE_CAM_FRAME_INTERVAL_MS = 900;
export const LIVE_CAM_STALE_MS = 8_000;

export type LiveCamFramePayload = {
  attemptId: string;
  studentId: string;
  examId: string;
  frame: string;
  ts: number;
  faceStatus?: string;
  cameraActive?: boolean;
  answeredCount?: number;
  totalQuestions?: number;
  timeRemainingSec?: number | null;
};

export function liveCamChannelName(schoolId: string): string {
  return `live-cam:${schoolId}`;
}

export function startLiveCamPublisher(opts: {
  schoolId: string;
  attemptId: string;
  studentId: string;
  examId: string;
  getStream: () => MediaStream | null;
  intervalMs?: number;
  getFaceMeta?: () => {
    faceStatus?: string;
    cameraActive?: boolean;
    answeredCount?: number;
    totalQuestions?: number;
    timeRemainingSec?: number | null;
  };
}): LiveCamPublisher {
  const intervalMs = opts.intervalMs ?? LIVE_CAM_FRAME_INTERVAL_MS;
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let publishing = false;

  channel = supabase.channel(liveCamChannelName(opts.schoolId), {
    config: { broadcast: { ack: false, self: false } },
  });

  const sendFrame = async () => {
    if (stopped || publishing) return;
    const stream = opts.getStream();
    if (!stream) return;
    publishing = true;
    try {
      const frame = await captureJpegFromStream(stream, { maxWidth: 360, quality: 0.52, mirror: true });
      if (stopped || !frame || !channel) return;
      const meta = opts.getFaceMeta?.() || {};
      void channel.send({
        type: "broadcast",
        event: LIVE_CAM_EVENT,
        payload: {
          attemptId: opts.attemptId,
          studentId: opts.studentId,
          examId: opts.examId,
          frame,
          ts: Date.now(),
          faceStatus: meta.faceStatus ?? "ok",
          cameraActive: meta.cameraActive !== false,
          answeredCount: meta.answeredCount,
          totalQuestions: meta.totalQuestions,
          timeRemainingSec: meta.timeRemainingSec,
        },
      });
    } catch (e) {
      console.warn("[live-cam]", e);
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
      if (timer) clearInterval(timer);
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    },
  };
}

export type LiveCamSubscriber = { stop: () => void };

export function startLiveCamSubscriber(opts: {
  schoolId: string;
  onFrame: (p: LiveCamFramePayload) => void;
}): LiveCamSubscriber {
  const lastTsByAttempt = new Map<string, number>();
  const channel = supabase.channel(liveCamChannelName(opts.schoolId), {
    config: { broadcast: { ack: false, self: false } },
  });

  channel.on("broadcast", { event: LIVE_CAM_EVENT }, ({ payload }) => {
    const raw = payload as LiveCamFramePayload & { attempt_id?: string };
    if (!raw?.frame) return;
    const attemptId = raw.attemptId || raw.attempt_id || "";
    if (!attemptId) return;
    const p: LiveCamFramePayload = { ...raw, attemptId };
    const prev = lastTsByAttempt.get(attemptId) ?? 0;
    if (p.ts && p.ts < prev - 500) return;
    if (p.ts) lastTsByAttempt.set(attemptId, p.ts);
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

export const LIVE_SCREEN_EVENT = "screen-frame";
export const LIVE_SCREEN_FRAME_INTERVAL_MS = 700;
export type LiveScreenFramePayload = {
  attemptId: string;
  studentId: string;
  examId: string;
  frame: string;
  ts: number;
  screenActive?: boolean;
};
export function liveScreenChannelName(schoolId: string): string {
  return `live-screen:${schoolId}`;
}
export type LiveScreenPublisher = { stop: () => void };

export function startLiveScreenPublisher(opts: {
  schoolId: string;
  attemptId: string;
  studentId: string;
  examId: string;
  getStream: () => MediaStream | null;
  intervalMs?: number;
}): LiveScreenPublisher {
  const intervalMs = opts.intervalMs ?? LIVE_SCREEN_FRAME_INTERVAL_MS;
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let publishing = false;

  channel = supabase.channel(liveScreenChannelName(opts.schoolId), {
    config: { broadcast: { ack: false, self: false } },
  });

  const sendFrame = async () => {
    if (stopped || publishing) return;
    publishing = true;
    try {
      // Prefer native MediaProjection JPEG (Android APK). Await plugin getLatestFrame so
      // frames flow even when the Capacitor "frame" listener misses an instance.
      let frame: string | null = null;
      try {
        frame = await awaitLatestNativeScreenJpeg();
      } catch {
        frame = getLatestNativeScreenJpeg();
      }
      if (!frame) {
        const stream = opts.getStream();
        if (stream) {
          frame = await captureJpegFromStream(stream, {
            maxWidth: 720,
            quality: 0.55,
            mirror: false,
          });
        }
      }
      if (stopped || !frame || !channel) return;
      void channel.send({
        type: "broadcast",
        event: LIVE_SCREEN_EVENT,
        payload: {
          attemptId: opts.attemptId,
          studentId: opts.studentId,
          examId: opts.examId,
          frame,
          ts: Date.now(),
          screenActive: true,
        },
      });
    } catch (e) {
      console.warn("[live-screen]", e);
    } finally {
      publishing = false;
    }
  };

  const startTimer = () => {
    if (stopped || timer) return;
    void sendFrame();
    timer = setInterval(() => void sendFrame(), intervalMs);
  };

  void channel.subscribe((status) => {
    if (stopped) return;
    if (status === "SUBSCRIBED") {
      startTimer();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn("[live-screen] channel status", status);
    }
  });
  // Fallback: if subscribe callback is delayed, still start publishing shortly
  window.setTimeout(() => {
    if (!stopped && !timer) startTimer();
  }, 1200);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    },
  };
}

export const LIVE_SCREEN_STALE_MS = 8_000;

export function isLiveScreenFrameFresh(ts: number | null | undefined, now = Date.now()): boolean {
  if (ts == null) return false;
  return now - ts <= LIVE_SCREEN_STALE_MS;
}

export type LiveScreenSubscriber = { stop: () => void };

/** Officer side: receive student screen JPEG frames over Realtime broadcast. */
export function startLiveScreenSubscriber(opts: {
  schoolId: string;
  onFrame: (p: LiveScreenFramePayload) => void;
}): LiveScreenSubscriber {
  const lastTsByAttempt = new Map<string, number>();
  const channel = supabase.channel(liveScreenChannelName(opts.schoolId), {
    config: { broadcast: { ack: false, self: false } },
  });

  channel.on("broadcast", { event: LIVE_SCREEN_EVENT }, ({ payload }) => {
    const raw = payload as LiveScreenFramePayload & { attempt_id?: string; student_id?: string };
    if (!raw?.frame) return;
    const attemptId = raw.attemptId || raw.attempt_id || "";
    if (!attemptId) return;
    const p: LiveScreenFramePayload = {
      attemptId,
      studentId: raw.studentId || raw.student_id || "",
      examId: raw.examId || "",
      frame: raw.frame,
      ts: raw.ts || Date.now(),
      screenActive: raw.screenActive !== false,
    };
    const prev = lastTsByAttempt.get(attemptId) ?? 0;
    if (p.ts && p.ts < prev - 500) return;
    if (p.ts) lastTsByAttempt.set(attemptId, p.ts);
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
