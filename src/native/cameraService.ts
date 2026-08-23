/**
 * Camera/microphone for CBT proctoring.
 * Web: getUserMedia directly.
 * Android Capacitor: request OS runtime permissions first, then getUserMedia in WebView.
 */
import { isNativeShell } from "@/native/platform";

export type CameraStreamOptions = {
  facingMode?: "user" | "environment";
  audio?: boolean;
};

export type PermissionResult = {
  granted: boolean;
  deniedPermanently?: boolean;
  error?: string;
};

export async function ensureCameraPermission(): Promise<PermissionResult> {
  if (!isNativeShell()) {
    return { granted: true };
  }
  try {
    const { Camera } = await import("@capacitor/camera");
    let status = await Camera.checkPermissions();
    if (status.camera === "granted") return { granted: true };
    if (status.camera === "prompt" || status.camera === "prompt-with-rationale") {
      status = await Camera.requestPermissions({ permissions: ["camera"] });
      if (status.camera === "granted") return { granted: true };
      return {
        granted: false,
        deniedPermanently: status.camera === "denied",
        error:
          "Camera permission is required for examinations. Enable Camera in Android Settings → Apps → D4EXAM → Permissions.",
      };
    }
    if (status.camera === "denied") {
      return {
        granted: false,
        deniedPermanently: true,
        error:
          "Camera permission denied. Open Android Settings → Apps → D4EXAM → Permissions and enable Camera.",
      };
    }
    status = await Camera.requestPermissions({ permissions: ["camera"] });
    if (status.camera === "granted") return { granted: true };
    return {
      granted: false,
      error: "Camera permission is required for examinations.",
    };
  } catch (e) {
    console.warn("[D4EXAM] Camera permission plugin error", e);
    return { granted: true };
  }
}

export async function ensureMicrophonePermission(): Promise<PermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { granted: false, error: "Microphone is not available on this device" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (e) {
    const name = (e as DOMException)?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        granted: false,
        deniedPermanently: true,
        error:
          "Microphone permission denied. Enable Microphone in Android Settings → Apps → D4EXAM if required for the exam.",
      };
    }
    return { granted: false, error: (e as Error).message || "Microphone unavailable" };
  }
}

export async function openCameraStream(
  options: CameraStreamOptions = {},
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not available on this device");
  }
  const cam = await ensureCameraPermission();
  if (!cam.granted) {
    throw new Error(cam.error || "Camera permission required");
  }
  if (options.audio) {
    try {
      await ensureMicrophonePermission();
    } catch {
      /* soft */
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: options.facingMode || "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: Boolean(options.audio),
    });
  } catch (e) {
    if (options.audio) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: options.facingMode || "user" },
          audio: false,
        });
      } catch {
        /* fall through */
      }
    }
    const name = (e as DOMException)?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new Error(
        "Camera permission is required for this examination. Enable Camera in Android Settings → Apps → D4EXAM.",
      );
    }
    throw e instanceof Error ? e : new Error("Could not open camera");
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
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

export const stopCameraStream = stopMediaStream;
