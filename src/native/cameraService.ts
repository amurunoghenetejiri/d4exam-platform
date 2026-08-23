/**
 * Camera access — getUserMedia on web (CBT proctoring already uses MediaStream).
 * Later: @capacitor/camera without changing call sites that use this module.
 */
export type CameraStreamOptions = {
  facingMode?: "user" | "environment";
};

export async function openCameraStream(
  options: CameraStreamOptions = {},
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not available on this device");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: options.facingMode || "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  });
}

export function stopCameraStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}
