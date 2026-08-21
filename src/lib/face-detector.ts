/**
 * Real, in-browser face detection for CBT camera monitoring.
 *
 * Order (most reliable continuous count first):
 *  1) MediaPipe BlazeFace WASM — works on mobile Chrome/Safari WebViews
 *  2) Native FaceDetector (Chrome/Edge) — fast when available
 *
 * Only the face COUNT is returned. No frames are uploaded.
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const MEDIAPIPE_LOAD_TIMEOUT_MS = 10_000;
/** Lower threshold so real faces are not stuck as "unclear". */
const MIN_DETECTION_CONFIDENCE = 0.32;

export type FaceEngine = {
  count: (video: HTMLVideoElement) => Promise<number | null>;
  close: () => void;
  backend: "mediapipe" | "native" | "hybrid";
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
    try {
      detector = new FD({ maxDetectedFaces: 5 });
    } catch {
      return null;
    }
  }
  return {
    backend: "native",
    count: async (video) => {
      if (!video || video.readyState < 2 || video.videoWidth < 16) return null;
      try {
        if (video.paused) {
          try {
            await video.play();
          } catch {
            /* ignore */
          }
        }
        const faces = await detector.detect(video);
        if (!faces) return null;
        return faces.length;
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
    let detector;
    try {
      detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      });
    } catch {
      detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      });
    }
    let lastTs = 0;
    return {
      backend: "mediapipe",
      count: async (video) => {
        if (!video || video.readyState < 2 || video.videoWidth < 16) return null;
        try {
          if (video.paused) {
            try {
              await video.play();
            } catch {
              /* ignore */
            }
          }
          const ts = Math.max(lastTs + 1, Math.round(performance.now()));
          lastTs = ts;
          const result = detector.detectForVideo(video, ts);
          const faces = result?.detections ?? [];
          return faces.length;
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const t = window.setTimeout(() => {
      if (done) return;
      done = true;
      resolve(null);
    }, ms);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        window.clearTimeout(t);
        resolve(v);
      },
      () => {
        if (done) return;
        done = true;
        window.clearTimeout(t);
        resolve(null);
      },
    );
  });
}

function makeHybrid(primary: FaceEngine, secondary: FaceEngine | null): FaceEngine {
  if (!secondary) return primary;
  let nullStreak = 0;
  return {
    backend: "hybrid",
    count: async (video) => {
      const a = await primary.count(video);
      if (a != null) {
        nullStreak = 0;
        return a;
      }
      nullStreak += 1;
      if (nullStreak >= 2) {
        const b = await secondary.count(video);
        if (b != null) {
          nullStreak = 0;
          return b;
        }
      }
      return null;
    },
    close: () => {
      try {
        primary.close();
      } catch {
        /* ignore */
      }
      try {
        secondary.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Create the best available face-detection engine, or null if none works. */
export async function createFaceEngine(): Promise<FaceEngine | null> {
  // MediaPipe first — more reliable face count on mobile (native often stuck unclear)
  const mp = await withTimeout(createMediapipe(), MEDIAPIPE_LOAD_TIMEOUT_MS);
  const native = createNative();
  if (mp && native) return makeHybrid(mp, native);
  if (mp) return mp;
  if (native) return native;
  return null;
}
