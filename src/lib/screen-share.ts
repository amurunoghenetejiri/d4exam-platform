/**
 * D4EXAM screen share for exam monitoring (Android APK first).
 * - Web / desktop: getDisplayMedia
 * - Native Android APK: D4ScreenShare MediaProjection plugin (system share-screen dialog)
 *
 * Frames are emitted as JPEG events from native; publisher reads getLatestNativeScreenJpeg().
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export type ScreenShareStartResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "unsupported" | "denied" | "error"; message: string };

type D4ScreenSharePlugin = {
  isAvailable(): Promise<{ available: boolean; platform?: string }>;
  start(): Promise<{ active: boolean }>;
  stop(): Promise<{ active: boolean }>;
  isActive(): Promise<{ active: boolean }>;
  addListener(
    event: "frame",
    cb: (data: { jpeg: string; width: number; height: number; ts: number }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(event: "stopped", cb: () => void): Promise<{ remove: () => void }>;
};

/** Lazy plugin — avoid registerPlugin at module load (breaks Vercel/SSR). */
let _plugin: D4ScreenSharePlugin | null = null;
function D4ScreenShare(): D4ScreenSharePlugin {
  if (!_plugin) {
    _plugin = registerPlugin<D4ScreenSharePlugin>("D4ScreenShare");
  }
  return _plugin;
}

let nativeFrameUnsub: { remove: () => void } | null = null;
let nativeStoppedUnsub: { remove: () => void } | null = null;
let nativeCanvas: HTMLCanvasElement | null = null;
let nativeStream: MediaStream | null = null;
let nativeActive = false;
let latestNativeScreenJpeg: string | null = null;
let endedCallbacks: Array<() => void> = [];

export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

function hasGetDisplayMedia(): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
  return typeof (navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown }).getDisplayMedia === "function";
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

/** Ensure frame + stopped listeners are attached (safe to call on reuse). */
async function ensureNativeFrameListeners(): Promise<void> {
  if (typeof document !== "undefined" && !nativeCanvas) {
    nativeCanvas = document.createElement("canvas");
    nativeCanvas.width = 720;
    nativeCanvas.height = 1280;
    const ctx = nativeCanvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0b1b3a";
      ctx.fillRect(0, 0, nativeCanvas.width, nativeCanvas.height);
    }
  }
  if (!nativeStream && nativeCanvas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream: MediaStream | null =
      typeof (nativeCanvas as any).captureStream === "function"
        ? (nativeCanvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(5)
        : null;
    nativeStream = stream || new MediaStream();
  }
  if (!nativeStream) nativeStream = new MediaStream();

  if (!nativeFrameUnsub) {
    try {
      nativeFrameUnsub = await D4ScreenShare().addListener("frame", (data) => {
        if (!data?.jpeg) return;
        try {
          latestNativeScreenJpeg = `data:image/jpeg;base64,${data.jpeg}`;
          nativeActive = true;
          if (!nativeCanvas) return;
          const img = new Image();
          img.onload = () => {
            try {
              if (!nativeCanvas) return;
              if (nativeCanvas.width !== img.width || nativeCanvas.height !== img.height) {
                nativeCanvas.width = img.width;
                nativeCanvas.height = img.height;
              }
              const c = nativeCanvas.getContext("2d");
              c?.drawImage(img, 0, 0);
            } catch {
              /* ignore */
            }
          };
          img.src = latestNativeScreenJpeg;
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }

  if (!nativeStoppedUnsub) {
    try {
      nativeStoppedUnsub = await D4ScreenShare().addListener("stopped", () => {
        nativeActive = false;
        latestNativeScreenJpeg = null;
        const cbs = endedCallbacks.slice();
        endedCallbacks = [];
        for (const cb of cbs) {
          try {
            cb();
          } catch {
            /* ignore */
          }
        }
      });
    } catch {
      /* ignore */
    }
  }
}

async function startNativeScreenShare(): Promise<ScreenShareStartResult> {
  try {
    if (nativeActive && nativeStream) {
      await ensureNativeFrameListeners();
      return { ok: true, stream: nativeStream };
    }
    try {
      const st = await D4ScreenShare().isActive();
      if (st?.active) {
        nativeActive = true;
        await ensureNativeFrameListeners();
        return { ok: true, stream: nativeStream! };
      }
    } catch {
      /* continue */
    }

    const avail = await D4ScreenShare().isAvailable();
    if (!avail?.available) {
      return {
        ok: false,
        reason: "unsupported",
        message: "Screen sharing is not available on this device.",
      };
    }

    await ensureNativeFrameListeners();

    await D4ScreenShare().start();
    nativeActive = true;
    return { ok: true, stream: nativeStream! };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
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
    const gdm = (navigator.mediaDevices as MediaDevices & {
      getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
    }).getDisplayMedia.bind(navigator.mediaDevices);
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
      return { ok: false, reason: "error", message: "No screen track returned." };
    }
    return { ok: true, stream };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
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
    const native = await startNativeScreenShare();
    if (native.ok) return native;
    if (native.reason !== "denied" && hasGetDisplayMedia()) {
      const web = await startWebScreenShare();
      if (web.ok) return web;
    }
    return native;
  }
  return startWebScreenShare();
}

export function stopScreenShareStream(stream: MediaStream | null | undefined): void {
  if (isNativeAndroid() && (nativeActive || latestNativeScreenJpeg)) {
    nativeActive = false;
    latestNativeScreenJpeg = null;
    try {
      void D4ScreenShare().stop();
    } catch {
      /* ignore */
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
  nativeCanvas = null;
}

export function onScreenShareEnded(stream: MediaStream, onEnded: () => void): () => void {
  if (isNativeAndroid()) {
    endedCallbacks.push(onEnded);
    void ensureNativeFrameListeners();
    const track = stream?.getVideoTracks?.()?.[0];
    if (track) {
      const handler = () => {
        if (nativeActive) return;
        try {
          onEnded();
        } catch {
          /* ignore */
        }
      };
      track.addEventListener("ended", handler);
      return () => {
        endedCallbacks = endedCallbacks.filter((c) => c !== onEnded);
        try {
          track.removeEventListener("ended", handler);
        } catch {
          /* ignore */
        }
      };
    }
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

export function getLatestNativeScreenJpeg(): string | null {
  return latestNativeScreenJpeg;
}

export function clearNativeScreenJpeg(): void {
  latestNativeScreenJpeg = null;
}

export function isNativeScreenShareActive(): boolean {
  return nativeActive || Boolean(latestNativeScreenJpeg);
}

export function getActiveScreenStream(): MediaStream | null {
  return nativeStream;
}

/** Sync JS flag from native isActive (call periodically during exam). */
export async function refreshNativeScreenShareState(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    await ensureNativeFrameListeners();
    const st = await D4ScreenShare().isActive();
    if (st?.active) {
      nativeActive = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  return nativeActive;
}
