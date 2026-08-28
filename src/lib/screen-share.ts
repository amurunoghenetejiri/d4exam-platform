/**
 * D4EXAM screen share for exam monitoring (Android APK first).
 * Native MediaProjection lifecycle is independent of React/WebView re-renders.
 * Frames arrive as JPEG events; publisher uses getLatestNativeScreenJpeg /
 * awaitLatestNativeScreenJpeg. setKeepAlive + static native state keep capture
 * alive through the entire exam session.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export type ScreenShareStartResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "unsupported" | "denied" | "error"; message: string };

export type ScreenShareStatus =
  | "idle"
  | "requesting"
  | "starting"
  | "active"
  | "disconnected"
  | "error"
  | "stopped";

type D4ScreenSharePlugin = {
  isAvailable(): Promise<{ available: boolean; platform?: string }>;
  start(): Promise<{ active: boolean; reused?: boolean; rebuilt?: boolean }>;
  stop(): Promise<{ active: boolean; ignored?: boolean }>;
  isActive(): Promise<{
    active: boolean;
    capturing?: boolean;
    hasProjection?: boolean;
    keepAlive?: boolean;
  }>;
  ensureRunning(): Promise<{ active: boolean; error?: string }>;
  getLatestFrame(): Promise<{
    active?: boolean;
    jpeg?: string;
    ts?: number;
    width?: number;
    height?: number;
  }>;
  setKeepAlive(opts: { hold: boolean }): Promise<{ keepAlive: boolean; active: boolean }>;
  addListener(
    event: "frame",
    cb: (data: { jpeg: string; width: number; height: number; ts: number }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(
    event: "stopped",
    cb: (data?: { active?: boolean }) => void,
  ): Promise<{ remove: () => void }>;
};

let _plugin: D4ScreenSharePlugin | null = null;
function D4ScreenShare(): D4ScreenSharePlugin {
  if (!_plugin) {
    _plugin = registerPlugin<D4ScreenSharePlugin>("D4ScreenShare");
  }
  return _plugin;
}

let nativeFrameUnsub: { remove: () => void } | null = null;
let nativeStoppedUnsub: { remove: () => void } | null = null;
let nativeStream: MediaStream | null = null;
let nativeActive = false;
let latestNativeScreenJpeg: string | null = null;
let lastFrameAt = 0;
let endedCallbacks: Array<() => void> = [];
let status: ScreenShareStatus = "idle";
/** While true, stopScreenShareStream is a no-op (exam holds the lock). */
let examHoldLock = false;
let listenersReady = false;
let nativeFramePollInFlight = false;

export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function hasGetDisplayMedia(): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
  return (
    typeof (navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown })
      .getDisplayMedia === "function"
  );
}

export function canAttemptScreenShare(): boolean {
  if (isNativeAndroid()) return true;
  return hasGetDisplayMedia();
}

export function isScreenShareSupported(): boolean {
  if (isNativeAndroid()) return true;
  if (!hasGetDisplayMedia()) return false;
  try {
    return typeof window !== "undefined" && window.isSecureContext === true;
  } catch {
    return false;
  }
}

export function getScreenShareStatus(): ScreenShareStatus {
  if (nativeActive || (lastFrameAt > 0 && Date.now() - lastFrameAt < 8000)) return "active";
  return status;
}

function applyNativeJpeg(raw: string | undefined | null, ts?: number): boolean {
  const trimmed = (raw || "").trim();
  if (!trimmed) return false;
  latestNativeScreenJpeg = trimmed.startsWith("data:")
    ? trimmed
    : `data:image/jpeg;base64,${trimmed}`;
  lastFrameAt = typeof ts === "number" && ts > 0 ? ts : Date.now();
  nativeActive = true;
  status = "active";
  return true;
}

/** Exam holds the projection until submit/terminate — prevents accidental stop. */
export function holdExamScreenShare(hold: boolean): void {
  examHoldLock = hold;
  console.info("[screen-share] SCREEN_SHARE_EXAM_HOLD", hold ? "on" : "off");
  if (isNativeAndroid()) {
    try {
      void D4ScreenShare().setKeepAlive({ hold });
    } catch {
      /* older APK without setKeepAlive */
    }
  }
}

async function ensureNativeFrameListeners(): Promise<void> {
  if (!nativeStream) {
    nativeStream = new MediaStream();
  }
  if (listenersReady && nativeFrameUnsub && nativeStoppedUnsub) return;

  if (!nativeFrameUnsub) {
    try {
      nativeFrameUnsub = await D4ScreenShare().addListener("frame", (data) => {
        if (!data?.jpeg) return;
        try {
          applyNativeJpeg(data.jpeg, data.ts);
        } catch {
          /* ignore */
        }
      });
    } catch (e) {
      console.warn("[screen-share] frame listener failed", e);
    }
  }

  if (!nativeStoppedUnsub) {
    try {
      nativeStoppedUnsub = await D4ScreenShare().addListener("stopped", () => {
        console.warn("[screen-share] SCREEN_SHARE_DISCONNECTED native stopped event");
        examHoldLock = false;
        nativeActive = false;
        latestNativeScreenJpeg = null;
        lastFrameAt = 0;
        status = "disconnected";
        const cbs = endedCallbacks.slice();
        for (const cb of cbs) {
          try {
            cb();
          } catch {
            /* ignore */
          }
        }
      });
    } catch (e) {
      console.warn("[screen-share] stopped listener failed", e);
    }
  }
  listenersReady = Boolean(nativeFrameUnsub);
}

async function startNativeScreenShare(): Promise<ScreenShareStartResult> {
  try {
    status = "requesting";
    await ensureNativeFrameListeners();

    try {
      const st = await D4ScreenShare().isActive();
      if (st?.active) {
        nativeActive = true;
        status = "active";
        examHoldLock = true;
        try {
          await D4ScreenShare().setKeepAlive({ hold: true });
        } catch {
          /* ignore */
        }
        try {
          const fr = await D4ScreenShare().getLatestFrame();
          applyNativeJpeg(fr?.jpeg, fr?.ts);
        } catch {
          /* ignore */
        }
        console.info("[screen-share] SCREEN_SHARE_CONNECTED reused active capture");
        return { ok: true, stream: nativeStream! };
      }
    } catch {
      /* continue */
    }

    if (nativeActive && lastFrameAt > 0 && Date.now() - lastFrameAt < 12000) {
      status = "active";
      examHoldLock = true;
      try {
        await D4ScreenShare().setKeepAlive({ hold: true });
      } catch {
        /* ignore */
      }
      return { ok: true, stream: nativeStream! };
    }

    const avail = await D4ScreenShare().isAvailable();
    if (!avail?.available) {
      status = "error";
      return {
        ok: false,
        reason: "unsupported",
        message: "Screen sharing is not available on this device.",
      };
    }

    status = "starting";
    console.info("[screen-share] SCREEN_SHARE_PERMISSION_REQUESTED");
    const result = await D4ScreenShare().start();
    if (!result?.active) {
      status = "error";
      return {
        ok: false,
        reason: "error",
        message: "Screen capture did not start. Please try again.",
      };
    }

    nativeActive = true;
    status = "active";
    examHoldLock = true;
    try {
      await D4ScreenShare().setKeepAlive({ hold: true });
    } catch {
      /* ignore */
    }
    listenersReady = false;
    if (nativeFrameUnsub) {
      try {
        nativeFrameUnsub.remove();
      } catch {
        /* ignore */
      }
      nativeFrameUnsub = null;
    }
    if (nativeStoppedUnsub) {
      try {
        nativeStoppedUnsub.remove();
      } catch {
        /* ignore */
      }
      nativeStoppedUnsub = null;
    }
    await ensureNativeFrameListeners();

    for (let i = 0; i < 8; i++) {
      try {
        const fr = await D4ScreenShare().getLatestFrame();
        if (applyNativeJpeg(fr?.jpeg, fr?.ts)) break;
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    console.info(
      "[screen-share] SCREEN_SHARE_CONNECTED",
      result.reused ? "reused" : result.rebuilt ? "rebuilt" : "fresh",
      "frame=",
      Boolean(latestNativeScreenJpeg),
    );
    return { ok: true, stream: nativeStream! };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status = "error";
    if (/denied|cancel|permission/i.test(msg)) {
      return {
        ok: false,
        reason: "denied",
        message: "Screen sharing was denied. Enable screen share to continue the exam.",
      };
    }
    return {
      ok: false,
      reason: "error",
      message: msg || "Could not start screen sharing.",
    };
  }
}

async function startWebScreenShare(): Promise<ScreenShareStartResult> {
  if (!hasGetDisplayMedia()) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Screen sharing is not available in this browser. Use the D4EXAM Android app.",
    };
  }
  try {
    status = "requesting";
    const gdm = (
      navigator.mediaDevices as MediaDevices & {
        getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
      }
    ).getDisplayMedia.bind(navigator.mediaDevices);
    const stream = await gdm({
      video: {
        frameRate: { ideal: 5, max: 10 },
        width: { ideal: 720, max: 1280 },
        height: { ideal: 1280, max: 1920 },
      } as MediaTrackConstraints,
      audio: false,
    } as DisplayMediaStreamOptions);
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      status = "error";
      return { ok: false, reason: "error", message: "No screen track returned." };
    }
    status = "active";
    examHoldLock = true;
    nativeStream = stream;
    console.info("[screen-share] SCREEN_SHARE_CONNECTED web");
    return { ok: true, stream };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    status = "error";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        ok: false,
        reason: "denied",
        message: "Screen sharing was denied. Enable screen share to continue the exam.",
      };
    }
    if (name === "NotSupportedError" || name === "NotFoundError") {
      return {
        ok: false,
        reason: "unsupported",
        message: "Screen sharing is not supported on this device.",
      };
    }
    return {
      ok: false,
      reason: "error",
      message: e instanceof Error ? e.message : "Could not start screen sharing.",
    };
  }
}

export async function startScreenShareStream(): Promise<ScreenShareStartResult> {
  if (isNativeAndroid()) {
    return startNativeScreenShare();
  }
  return startWebScreenShare();
}

/** Explicit stop only (exam submit / leave). Exam hold lock blocks accidental stop. */
export function stopScreenShareStream(stream: MediaStream | null | undefined): void {
  if (examHoldLock && isNativeAndroid()) {
    console.warn("[screen-share] stop ignored — exam hold lock active");
    if (stream && stream !== nativeStream) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
    }
    return;
  }

  console.info("[screen-share] SCREEN_SHARE_STOPPED");
  status = "stopped";
  examHoldLock = false;

  if (isNativeAndroid()) {
    nativeActive = false;
    latestNativeScreenJpeg = null;
    lastFrameAt = 0;
    try {
      void D4ScreenShare()
        .setKeepAlive({ hold: false })
        .then(() => {
          try {
            void D4ScreenShare().stop();
          } catch {
            /* ignore */
          }
        });
    } catch {
      try {
        void D4ScreenShare().stop();
      } catch {
        /* ignore */
      }
    }
  }

  if (nativeFrameUnsub) {
    try {
      nativeFrameUnsub.remove();
    } catch {
      /* ignore */
    }
    nativeFrameUnsub = null;
  }
  if (nativeStoppedUnsub) {
    try {
      nativeStoppedUnsub.remove();
    } catch {
      /* ignore */
    }
    nativeStoppedUnsub = null;
  }
  listenersReady = false;
  endedCallbacks = [];

  if (stream) {
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }
  if (nativeStream && nativeStream !== stream) {
    try {
      nativeStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }
  nativeStream = null;
}

export function onScreenShareEnded(stream: MediaStream, onEnded: () => void): () => void {
  if (isNativeAndroid()) {
    endedCallbacks.push(onEnded);
    void ensureNativeFrameListeners();
    return () => {
      endedCallbacks = endedCallbacks.filter((c) => c !== onEnded);
    };
  }

  const track = stream?.getVideoTracks?.()?.[0];
  if (!track) return () => {};
  const handler = () => {
    try {
      onEnded();
    } catch {
      /* ignore */
    }
  };
  track.addEventListener("ended", handler);
  return () => {
    try {
      track.removeEventListener("ended", handler);
    } catch {
      /* ignore */
    }
  };
}

/** Pull the newest native JPEG (listener cache + async plugin poll). */
export function getLatestNativeScreenJpeg(): string | null {
  if (isNativeAndroid() && !nativeFramePollInFlight) {
    nativeFramePollInFlight = true;
    void (async () => {
      try {
        await ensureNativeFrameListeners();
        const r = await D4ScreenShare().getLatestFrame();
        applyNativeJpeg(r?.jpeg, r?.ts);
        if (r?.active) {
          nativeActive = true;
          status = "active";
        }
      } catch {
        /* older APK without getLatestFrame */
      } finally {
        nativeFramePollInFlight = false;
      }
    })();
  }
  return latestNativeScreenJpeg;
}

/**
 * Await a fresh native JPEG for the live publisher.
 * Returns null only if native capture has no frame yet.
 */
export async function awaitLatestNativeScreenJpeg(): Promise<string | null> {
  if (!isNativeAndroid()) return latestNativeScreenJpeg;
  try {
    await ensureNativeFrameListeners();
    try {
      const ensured = await D4ScreenShare().ensureRunning();
      if (ensured?.active) {
        nativeActive = true;
        status = "active";
      }
    } catch {
      /* older APK */
    }
    const r = await D4ScreenShare().getLatestFrame();
    applyNativeJpeg(r?.jpeg, r?.ts);
    if (r?.active) {
      nativeActive = true;
      status = "active";
    }
  } catch {
    /* ignore */
  }
  if (latestNativeScreenJpeg && lastFrameAt > 0 && Date.now() - lastFrameAt < 10000) {
    return latestNativeScreenJpeg;
  }
  return latestNativeScreenJpeg;
}

export function clearNativeScreenJpeg(): void {
  latestNativeScreenJpeg = null;
}

export function isNativeScreenShareActive(): boolean {
  return nativeActive || (lastFrameAt > 0 && Date.now() - lastFrameAt < 8000);
}

export function getActiveScreenStream(): MediaStream | null {
  return nativeStream;
}

export async function refreshNativeScreenShareState(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    await ensureNativeFrameListeners();
    try {
      const ensured = await D4ScreenShare().ensureRunning();
      if (ensured?.active) {
        nativeActive = true;
        status = "active";
      }
    } catch {
      /* older APK without ensureRunning */
    }
    try {
      const fr = await D4ScreenShare().getLatestFrame();
      if (applyNativeJpeg(fr?.jpeg, fr?.ts)) return true;
      if (fr?.active) {
        nativeActive = true;
        status = "active";
        return true;
      }
    } catch {
      /* older APK */
    }
    const st = await D4ScreenShare().isActive();
    if (st?.active) {
      nativeActive = true;
      status = "active";
      return true;
    }
  } catch {
    /* ignore */
  }
  if (lastFrameAt > 0 && Date.now() - lastFrameAt < 8000) {
    nativeActive = true;
    return true;
  }
  return nativeActive;
}
