/**
 * Real, in-browser face detection for CBT camera monitoring.
 *
 * Primary engine: MediaPipe BlazeFace (short range) running locally via WASM.
 * Fallback: the browser's native FaceDetector API where available.
 *
 * Nothing is uploaded — only the resulting face COUNT is used by the caller,
 * which then records event metadata (never video frames).
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

export type FaceEngine = {
  /** Number of faces in the current video frame, or null when detection failed. */
  count: (video: HTMLVideoElement) => Promise<number | null>;
  close: () => void;
  backend: "mediapipe" | "native";
};

type NativeDetector = { detect: (v: HTMLVideoElement) => Promise<unknown[]> };

async function createMediapipe(): Promise<FaceEngine | null> {
  try {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    const detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
    let lastTs = 0;
    return {
      backend: "mediapipe",
      count: async (video) => {
        if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
        try {
          // timestamps must be strictly increasing for VIDEO mode
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
  } catch {
    return null;
  }
}

function createNative(): FaceEngine | null {
  if (typeof window === "undefined") return null;
  const FD = (window as unknown as { FaceDetector?: new (o?: object) => NativeDetector })
    .FaceDetector;
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
      if (!video || video.readyState < 2) return null;
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

/** Create the best available face-detection engine, or null if none works. */
export async function createFaceEngine(): Promise<FaceEngine | null> {
  const mp = await createMediapipe();
  if (mp) return mp;
  return createNative();
}
