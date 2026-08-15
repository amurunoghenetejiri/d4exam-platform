/**
 * Real, in-browser face detection for CBT camera monitoring.
 *
 * Order:
 *  1) Native FaceDetector (Chrome/Edge) — fast, no download
 *  2) MediaPipe BlazeFace WASM — broader support
 *
 * Only the face COUNT is returned. No frames are uploaded.
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

export type FaceEngine = {
  count: (video: HTMLVideoElement) => Promise<number | null>;
  close: () => void;
  backend: "mediapipe" | "native";
};

type NativeDetector = { detect: (v: HTMLVideoElement) => Promise<unknown[]> };

function createNative(): FaceEngine | null {
  if (typeof window === "undefined") return null;
  const FD = (window as unknown as { FaceDetector?: new (o?: object) => NativeDetector }).FaceDetector;
  if (!FD) return null;
  let detector: NativeDetector;
  try {
    detector = new FD({ fastMode: true, maxDetectedFaces: 5 });
  } catch {
    return null;
  }
  return {
    backend: "native",
    count: async (video) => {
      if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
      try {
        const faces = await detector.detect(video);
        return faces?.length ?? 0;
      } catch {
        return null;
      }
    },
    close: () => {},
  };
}

async function createMediapipe(): Promise<FaceEngine | null> {
  try {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    // Try GPU first, fall back to CPU if WebGL is blocked
    let detector;
    try {
      detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.45,
      });
    } catch {
      detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.45,
      });
    }
    let lastTs = 0;
    return {
      backend: "mediapipe",
      count: async (video) => {
        if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
        try {
          const ts = Math.max(lastTs + 1, Math.round(performance.now()));
          lastTs = ts;
          const res = detector.detectForVideo(video, ts);
          return res?.detections?.length ?? 0;
        } catch {
          return null;
        }
      },
      close: () => {
        try {
          detector.close();
        } catch {
          /* noop */
        }
      },
    };
  } catch (e) {
    console.warn("[face-detector] MediaPipe unavailable", e);
    return null;
  }
}

/** Create the best available face-detection engine, or null if none works. */
export async function createFaceEngine(): Promise<FaceEngine | null> {
  // Native first — works offline and starts immediately when supported
  const native = createNative();
  if (native) return native;
  return createMediapipe();
}
