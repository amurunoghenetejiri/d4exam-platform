/**
 * D4EXAM screen share for exam monitoring (Android APK first).
 * Uses getDisplayMedia when available (Capacitor WebView / modern browsers).
 * Teacher "required" = must share when device supports it; unsupported devices may continue without share.
 */
import { Capacitor } from "@capacitor/core";

export type ScreenShareStartResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "unsupported" | "denied" | "error"; message: string };

export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** True when the runtime can attempt screen capture. */
export function canAttemptScreenShare(): boolean {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return false;
  return typeof (navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown }).getDisplayMedia === "function";
}

/**
 * Native Android APK is treated as screen-share capable when getDisplayMedia exists.
 * Plain website without getDisplayMedia → not supported (student continues if teacher enabled share).
 */
export function isScreenShareSupported(): boolean {
  if (!canAttemptScreenShare()) return false;
  if (isNativeAndroid()) return true;
  try {
    return typeof window !== "undefined" && window.isSecureContext === true;
  } catch {
    return false;
  }
}

export async function startScreenShareStream(): Promise<ScreenShareStartResult> {
  if (!canAttemptScreenShare()) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Screen sharing is not available on this device. Use the D4EXAM Android app for screen monitoring.",
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

export function stopScreenShareStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

/** Fires once when the user stops sharing (system UI or track end). */
export function onScreenShareEnded(stream: MediaStream, cb: () => void): () => void {
  const tracks = stream.getVideoTracks();
  const handlers: Array<{ track: MediaStreamTrack; fn: () => void }> = [];
  for (const track of tracks) {
    const fn = () => cb();
    track.addEventListener("ended", fn);
    handlers.push({ track, fn });
  }
  return () => {
    for (const { track, fn } of handlers) {
      try {
        track.removeEventListener("ended", fn);
      } catch {
        /* ignore */
      }
    }
  };
}

export function screenShareActive(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled !== false);
}
