/**
 * In-browser face detection for CBT camera monitoring.
 * Returns face COUNT only — no frames uploaded.
 *
 * Native FaceDetector preferred for speed; MediaPipe fallback.
 * Includes confidence filtering + IoU NMS to avoid false multi-face.
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const MEDIAPIPE_LOAD_TIMEOUT_MS = 8_000;
const MIN_DETECTION_CONFIDENCE = 0.42;
const STRONG_SCORE = 0.4;
const NMS_IOU = 0.35;

type Box = { x: number; y: number; w: number; h: number; score: number };

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}

function nmsCount(boxes: Box[]): number {
  if (!boxes.length) return 0;
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const b of sorted) {
    if (b.score < STRONG_SCORE && kept.length === 0) {
      if (b.score >= 0.25) kept.push(b);
      continue;
    }
    if (b.score < STRONG_SCORE) continue;
    let overlap = false;
    for (const k of kept) {
      if (iou(b, k) >= NMS_IOU) {
        overlap = true;
        break;
      }
    }
    if (!overlap) kept.push(b);
  }
  return kept.length;
}

function extractBoxes(faces: unknown[]): Box[] {
  const out: Box[] = [];
  for (const f of faces ?? []) {
    const any = f as {
      categories?: { score?: number }[];
      score?: number;
      boundingBox?: { x?: number; y?: number; width?: number; height?: number; xMin?: number; yMin?: number };
      box?: { x?: number; y?: number; width?: number; height?: number };
    };
    const score =
      any?.categories?.[0]?.score ?? (typeof any.score === "number" ? any.score : 0.55);
    const bb = any.boundingBox ?? any.box;
    if (!bb) {
      if (score >= STRONG_SCORE) out.push({ x: 0, y: 0, w: 1, h: 1, score });
      continue;
    }
    const x = Number(bb.x ?? bb.xMin ?? 0);
    const y = Number(bb.y ?? bb.yMin ?? 0);
    const w = Number(bb.width ?? 0);
    const h = Number(bb.height ?? 0);
    if (w > 0 && h > 0 && w * h < 80) continue;
    out.push({ x, y, w: Math.max(1, w), h: Math.max(1, h), score: score || 0.55 });
  }
  return out;
}

function confidentFaceCount(faces: unknown[]): number {
  if (!faces?.length) return 0;
  const boxes = extractBoxes(faces);
  if (!boxes.length) return 0;
  return nmsCount(boxes);
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
        let faces: unknown[] | null = null;
        try {
          faces = await detector.detect(video);
        } catch {
          /* canvas fallback */
        }
        if (faces == null && canvas && ctx) {
          const w = Math.min(video.videoWidth, 320);
          const h = Math.round((video.videoHeight / video.videoWidth) * w) || 240;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          faces = await detector.detect(canvas);
        }
        if (!faces) return null;
        return confidentFaceCount(faces);
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

export async function createFaceEngine(): Promise<FaceEngine | null> {
  const native = createNative();
  if (native) return native;
  return withTimeout(createMediapipe(), MEDIAPIPE_LOAD_TIMEOUT_MS);
}

export function preloadFaceEngine(): void {
  if (typeof window === "undefined") return;
  void createFaceEngine().then((e) => e?.close());
}
