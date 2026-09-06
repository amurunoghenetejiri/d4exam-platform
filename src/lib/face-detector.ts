/**
 * Face detection for CBT camera monitoring — NO remote CDN dependency.
 * Offline-first: never loads MediaPipe/WASM from the network (that froze
 * the app when offline). Uses browser FaceDetector when available; otherwise
 * returns null immediately so the exam continues with camera-only monitoring.
 */

export type FaceEngine = {
  count: (video: HTMLVideoElement) => Promise<number | null>;
  close: () => void;
};

function videoReady(video: HTMLVideoElement): boolean {
  return (
    !!video &&
    video.readyState >= 2 &&
    video.videoWidth >= 16 &&
    video.videoHeight >= 16
  );
}

function createNative(): FaceEngine | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FD = (window as any).FaceDetector;
    if (typeof FD !== "function") return null;
    const detector = new FD({ fastMode: true, maxDetectedFaces: 4 });
    return {
      count: async (video) => {
        if (!videoReady(video)) return null;
        try {
          if (video.paused) {
            try {
              await video.play();
            } catch {
              /* ignore */
            }
          }
          const faces = await detector.detect(video);
          return Array.isArray(faces) ? faces.length : 0;
        } catch {
          return null;
        }
      },
      close: () => {
        /* native FaceDetector has no close */
      },
    };
  } catch {
    return null;
  }
}

/**
 * Create a face engine without any network. Never blocks the UI.
 * Returns null when the device has no FaceDetector — caller must treat as camera-only.
 */
export async function createFaceEngine(): Promise<FaceEngine | null> {
  try {
    return createNative();
  } catch {
    return null;
  }
}

/** No-op preload — do not fetch models or hang the main thread. */
export function preloadFaceEngine(): void {
  /* intentionally empty — offline-first, no CDN */
}

export function confidentFaceCount(faces: unknown[]): number {
  return Array.isArray(faces) ? faces.length : 0;
}
