/**
 * Real browser & device capability detection for D4EXAM CBT.
 * No hardcoded product assumptions beyond feature API presence.
 */

export type DeviceType = "desktop" | "tablet" | "mobile" | "unknown";

export type BrowserName =
  | "Chrome"
  | "Edge"
  | "Firefox"
  | "Safari"
  | "Opera"
  | "Samsung Internet"
  | "Other";

export type DeviceCapabilities = {
  deviceType: DeviceType;
  browserName: BrowserName;
  userAgent: string;
  mediaDevices: boolean;
  camera: boolean;
  microphone: boolean;
  faceDetection: boolean;
  screenShare: boolean;
  secureContext: boolean;
};

function detectDeviceType(ua: string): DeviceType {
  const u = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|opera mini/i.test(ua)) return "mobile";
  if (/macintosh|windows nt|linux|cros|x11/i.test(u) && !/mobi/i.test(u)) return "desktop";
  if (typeof window !== "undefined") {
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.innerWidth < 768;
    if (coarse && narrow) return "mobile";
    if (coarse) return "tablet";
  }
  return "unknown";
}

function detectBrowserName(ua: string): BrowserName {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS/i.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS/i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua) && !/Chrome\/|CriOS|Edg\//i.test(ua)) return "Safari";
  return "Other";
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      deviceType: "unknown",
      browserName: "Other",
      userAgent: "",
      mediaDevices: false,
      camera: false,
      microphone: false,
      faceDetection: false,
      screenShare: false,
      secureContext: false,
    };
  }

  const ua = navigator.userAgent || "";
  const mediaDevices = Boolean(navigator.mediaDevices);
  const secureContext =
    typeof window.isSecureContext === "boolean"
      ? window.isSecureContext
      : window.location.protocol === "https:" || window.location.hostname === "localhost";

  const camera =
    mediaDevices &&
    secureContext &&
    typeof navigator.mediaDevices.getUserMedia === "function";

  const microphone = camera;

  // Native FaceDetector OR MediaPipe WASM fallback (used in CBT).
  // Mobile Chrome often lacks FaceDetector but MediaPipe works with camera.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nativeFace = typeof (window as any).FaceDetector === "function";
  const faceDetection = nativeFace || camera;

  const screenShare =
    mediaDevices &&
    secureContext &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (navigator.mediaDevices as any).getDisplayMedia === "function";

  return {
    deviceType: detectDeviceType(ua),
    browserName: detectBrowserName(ua),
    userAgent: ua,
    mediaDevices,
    camera,
    microphone,
    faceDetection,
    screenShare,
    secureContext,
  };
}

export function capabilitiesSnapshot(
  caps: DeviceCapabilities,
  live?: {
    cameraActive?: boolean;
    screenShareActive?: boolean;
    faceStatus?: string;
  },
) {
  return {
    device_type: caps.deviceType,
    browser_name: caps.browserName,
    screen_share_supported: caps.screenShare,
    screen_share_status: live?.screenShareActive
      ? "active"
      : caps.screenShare
        ? "available"
        : "unsupported",
    camera_supported: caps.camera,
    camera_status: live?.cameraActive ? "active" : caps.camera ? "available" : "unsupported",
    face_detection_supported: caps.faceDetection,
    face_detection_status: live?.faceStatus ?? (caps.faceDetection ? "available" : "unsupported"),
    secure_context: caps.secureContext,
  };
}
