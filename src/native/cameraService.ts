/**
 * Camera/microphone for CBT proctoring.
 * Web: getUserMedia.
 * Android Capacitor: request OS runtime permissions first (so Camera/Mic appear in App Settings),
 * then getUserMedia in the WebView.
 *
 * Important: getUserMedia must be triggered from a user gesture on many mobile WebViews.
 * Do not auto-start camera on mount — always call from a button click.
 */
import { isNativeShell } from "@/native/platform";

async function withMediaTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${label} timed out. Allow camera permission in the system dialog or App Settings, then try again.`,
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type CameraStreamOptions = {
  facingMode?: "user" | "environment";
  audio?: boolean;
  /** Skip Capacitor native check (when already granted). */
  skipPermissionProbe?: boolean;
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

/**
 * Native Android CAMERA permission only (no getUserMedia).
 */
export async function ensureNativeCameraPermission(): Promise<PermissionResult> {
  if (!isNativeShell()) return { granted: true };
  try {
    const { Camera } = await import("@capacitor/camera");
    let status = await withMediaTimeout(Camera.checkPermissions(), 6_000, "Camera permission check");
    if (status.camera !== "granted") {
      status = await withMediaTimeout(
        Camera.requestPermissions({ permissions: ["camera"] }),
        25_000,
        "Camera permission dialog",
      );
    }
    if (status.camera !== "granted") {
      return {
        granted: false,
        deniedPermanently: status.camera === "denied",
        error: "Camera permission is required. Tap Open App Settings → enable Camera, then try again.",
      };
    }
    return { granted: true };
  } catch (e) {
    console.warn("[D4EXAM] Camera permission plugin error", e);
    const msg = (e as Error)?.message || "";
    if (msg.toLowerCase().includes("timed out")) {
      return { granted: false, error: msg };
    }
    return { granted: true };
  }
}

async function probeGetUserMedia(constraints: MediaStreamConstraints): Promise<PermissionResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { granted: false, error: "Media devices are not available on this device" };
  }
  try {
    const stream = await withMediaTimeout(
      navigator.mediaDevices.getUserMedia(constraints),
      12_000,
      "Camera/microphone request",
    );
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
        error: "Permission denied. Tap Open App Settings → Permissions → enable Camera and Microphone.",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { granted: false, error: "No camera or microphone was found on this device." };
    }
    return { granted: false, error: (e as Error).message || "Media unavailable" };
  }
}

export async function ensureCameraPermission(): Promise<PermissionResult> {
  const native = await ensureNativeCameraPermission();
  if (!native.granted) return native;
  return { granted: true };
}

export async function ensureMicrophonePermission(): Promise<PermissionResult> {
  return probeGetUserMedia({ audio: true, video: false });
}

/**
 * Request camera + microphone so OS dialogs appear when the student taps Allow.
 * Single combined getUserMedia probe to avoid locking the camera on Android.
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
    const native = await ensureNativeCameraPermission();
    if (!native.granted) {
      return { camera: native, microphone };
    }
  }

  if (needCam || needMic) {
    const constraints: MediaStreamConstraints = {
      video: needCam ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
      audio: needMic,
    };
    const probe = await probeGetUserMedia(constraints);
    if (needCam) {
      camera = probe.granted
        ? { granted: true }
        : { granted: false, deniedPermanently: probe.deniedPermanently, error: probe.error };
    }
    if (needMic) {
      if (probe.granted) {
        microphone = { granted: true };
      } else if (needCam) {
        microphone = await ensureMicrophonePermission();
      } else {
        microphone = probe;
      }
    }
  }

  return { camera, microphone };
}

export async function openCameraStream(options: CameraStreamOptions = {}): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not available on this device");
  }

  if (!options.skipPermissionProbe) {
    const native = await ensureNativeCameraPermission();
    if (!native.granted) {
      throw new Error(native.error || "Camera permission required");
    }
  }

  const tryOpen = (audio: boolean) =>
    withMediaTimeout(
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: options.facingMode || "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio,
      }),
      15_000,
      audio ? "Opening camera with microphone" : "Opening camera",
    );

  try {
    return await tryOpen(Boolean(options.audio));
  } catch (e) {
    if (options.audio) {
      try {
        return await tryOpen(false);
      } catch {
        /* fall through */
      }
    }
    const name = (e as DOMException)?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new Error("Camera permission is required. Open App Settings → Permissions → enable Camera.");
    }
    if (name === "NotReadableError" || name === "AbortError") {
      throw new Error(
        "Camera is in use by another app or still starting. Close other camera apps, wait a moment, then try again.",
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
