/**
 * In-browser face detection for CBT camera monitoring.
 * Returns face COUNT only — no frames uploaded.
 *
 * Mobile: prefer native FaceDetector so counting starts in <1s.
 * MediaPipe loads in background only (never blocks first detection).
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const MEDIAPIPE_LOAD_TIMEOUT_MS = 8_000;
const MIN_DETECTION_CONFIDENCE = 0.18;

function confidentFaceCount(faces: unknown[]): number {
  if (!faces?.length) return 0;
  let strong = 0;
  for (const f of faces) {
    const any = f as {
      categories?: { score?: number }[];
      keypoints?: unknown[];
      boundingBox?: unknown;
      score?: number;
    };
    const score =
      any?.categories?.[0]?.score ?? (typeof any.score === "number" ? any.score : undefined);
    if (score == null || score >= 0.35) strong += 1;
  }
  if (strong === 0 && faces.length > 0) return 1;
  return strong;
}

export type FaceEngine = {
  count: (video: HTMLVideoElement) => Promise<number | null>;
  close: () => void;
  backend: "mediapipe" | "native" | "hybrid";
};

type NativeDetector = {
  detect: (v: HTMLVideoElement | ImageBitmap | HTMLCanvasElement) => Promise<unknown[]>;
};

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

  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;

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
        try {
          const faces = await detector.detect(video);
          if (faces && faces.length >= 0) return faces.length;
        } catch {
          /* canvas fallback */
        }
        if (canvas && ctx) {
          const w = Math.min(video.videoWidth, 320);
          const h = Math.round((video.videoHeight / video.videoWidth) * w) || 240;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const faces = await detector.detect(canvas);
          if (faces) return faces.length;
        }
        return null;
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

    let detector: {
      detect?: (img: HTMLVideoElement | HTMLCanvasElement) => { detections?: unknown[] };
      detectForVideo?: (img: HTMLVideoElement, ts: number) => { detections?: unknown[] };
      close: () => void;
    } | null = null;
    let mode: "IMAGE" | "VIDEO" = "IMAGE";

    const tryCreate = async (runningMode: "IMAGE" | "VIDEO", delegate: "GPU" | "CPU") => {
      return vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode,
        minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      });
    };

    try {
      detector = await tryCreate("IMAGE", "GPU");
      mode = "IMAGE";
    } catch {
      try {
        detector = await tryCreate("IMAGE", "CPU");
        mode = "IMAGE";
      } catch {
        try {
          detector = await tryCreate("VIDEO", "GPU");
          mode = "VIDEO";
        } catch {
          detector = await tryCreate("VIDEO", "CPU");
          mode = "VIDEO";
        }
      }
    }

    if (!detector) return null;

    let lastTs = 0;
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;

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

          let faces: unknown[] = [];

          if (mode === "IMAGE" && typeof detector!.detect === "function") {
            if (canvas && ctx) {
              const w = Math.min(video.videoWidth, 320);
              const h = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w) || 240;
              if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
              }
              ctx.drawImage(video, 0, 0, w, h);
              const result = detector!.detect(canvas);
              faces = result?.detections ?? [];
            } else {
              const result = detector!.detect(video);
              faces = result?.detections ?? [];
            }
          } else if (typeof detector!.detectForVideo === "function") {
            const ts = Math.max(lastTs + 1, Math.round(performance.now()));
            lastTs = ts;
            const result = detector!.detectForVideo(video, ts);
            faces = result?.detections ?? [];
          }

          return confidentFaceCount(faces);
        } catch {
          return null;
        }
      },
      close: () => {
        try {
          detector?.close();
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

/**
 * Create face engine ASAP:
 * 1) Native FaceDetector if available (instant)
 * 2) MediaPipe only if native is missing
 */
export async function createFaceEngine(): Promise<FaceEngine | null> {
  const native = createNative();
  if (native) {
    void withTimeout(createMediapipe(), MEDIAPIPE_LOAD_TIMEOUT_MS).then((mp) => {
      void mp;
    });
    return native;
  }
  return withTimeout(createMediapipe(), MEDIAPIPE_LOAD_TIMEOUT_MS);
}

/** Warm MediaPipe model during device check / pre-exam (optional). */
export function preloadFaceEngine(): void {
  if (typeof window === "undefined") return;
  void createFaceEngine().then((e) => e?.close());
}
