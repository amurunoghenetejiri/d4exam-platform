/**
 * Camera/microphone for CBT proctoring.
 * Web: getUserMedia.
 * Android Capacitor: request OS runtime permissions first (so Camera/Mic appear in App Settings),
 * then getUserMedia in the WebView.
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

/** Open Android App Info → Permissions so the student can enable Camera / Microphone. */
export async function openAppPermissionSettings(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (isNativeShell()) {
      const pkg = "com.d4exam.app";
      const intent =
        "intent://settings#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;" +
        `data=package:${pkg};end`;
      window.location.href = intent;
      return;
    }
  } catch (e) {
    console.warn("[D4EXAM] openAppPermissionSettings", e);
  }
}

async function probeGetUserMedia(
  constraints: MediaStreamConstraints,
): Promise<PermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { granted: false, error: "Media devices are not available on this device" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    return { granted: true };
  } catch (e) {
    const name = (e as DOMException)?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        granted: false,
        deniedPermanently: true,
        error:
          "Permission denied. Tap Open App Settings → Permissions → enable Camera and Microphone.",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { granted: false, error: "No camera or microphone was found on this device." };
    }
    return { granted: false, error: (e as Error).message || "Media unavailable" };
  }
}

/**
 * Request native Android CAMERA permission (shows system dialog and lists Camera in App Settings).
 * Then probe WebView getUserMedia so the in-app preview works.
 */
export async function ensureCameraPermission(): Promise<PermissionResult> {
  if (isNativeShell()) {
    try {
      const { Camera } = await import("@capacitor/camera");
      let status = await Camera.checkPermissions();
      if (status.camera !== "granted") {
        status = await Camera.requestPermissions({ permissions: ["camera"] });
      }
      if (status.camera !== "granted") {
        return {
          granted: false,
          deniedPermanently: status.camera === "denied",
          error:
            "Camera permission is required. Tap Open App Settings → enable Camera, then try again.",
        };
      }
    } catch (e) {
      console.warn("[D4EXAM] Camera permission plugin error", e);
    }
  }
  return probeGetUserMedia({ video: true, audio: false });
}

/** Request microphone via getUserMedia (WebView shows system mic dialog on Android). */
export async function ensureMicrophonePermission(): Promise<PermissionResult> {
  return probeGetUserMedia({ audio: true, video: false });
}

/**
 * Request camera + microphone together so OS dialogs appear when starting an exam.
 */
export async function requestExamMediaPermissions(opts: {
  camera?: boolean;
  microphone?: boolean;
}): Promise<{ camera: PermissionResult; microphone: PermissionResult }> {
  const needCam = opts.camera !== false;
  const needMic = Boolean(opts.microphone);

  let camera: PermissionResult = { granted: !needCam };
  let microphone: PermissionResult = { granted: !needMic };

  if (needCam) {
    camera = await ensureCameraPermission();
  }
  if (needMic) {
    if (needCam && camera.granted) {
      const both = await probeGetUserMedia({ video: true, audio: true });
      if (both.granted) {
        microphone = { granted: true };
      } else {
        microphone = await ensureMicrophonePermission();
      }
    } else {
      microphone = await ensureMicrophonePermission();
    }
  }

  return { camera, microphone };
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
        "Camera permission is required. Open App Settings → Permissions → enable Camera.",
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
