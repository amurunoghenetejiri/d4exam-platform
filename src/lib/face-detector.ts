/**
 * In-browser face detection for CBT camera monitoring.
 * Returns face COUNT only — no frames uploaded.
 *
 * Native FaceDetector preferred; MediaPipe fallback with retries.
 * Confidence filtering + IoU NMS to reduce false multi-face.
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const MEDIAPIPE_LOAD_TIMEOUT_MS = 22_000;
const STRONG_SCORE = 0.42;
const WEAK_SCORE = 0.28;
const NMS_IOU = 0.45;

export type FaceEngine = {
  count: (video: HTMLVideoElement) => Promise<number | null>;
  close: () => void;
};

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

/** Merge overlapping boxes so one face is not counted twice. */
function nmsCount(boxes: Box[]): number {
  if (!boxes.length) return 0;
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const b of sorted) {
    if (b.score < WEAK_SCORE) continue;
    let overlap = false;
    for (const k of kept) {
      if (iou(b, k) >= NMS_IOU) {
        overlap = true;
        break;
      }
    }
    if (!overlap) kept.push(b);
  }
  const strong = kept.filter((b) => b.score >= STRONG_SCORE);
  if (strong.length === 1 && kept.length > 1) {
    const weakOnly = kept.filter((b) => b.score < STRONG_SCORE);
    if (weakOnly.every((w) => iou(w, strong[0]) > 0.15)) return 1;
  }
  return kept.length;
}

function extractBoxes(faces: unknown[]): Box[] {
  const out: Box[] = [];
  for (const f of faces ?? []) {
    const any = f as {
      categories?: { score?: number }[];
      score?: number;
      boundingBox?: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        xMin?: number;
        yMin?: number;
      };
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
    if (w <= 0 || h <= 0) continue;
    if (score < WEAK_SCORE) continue;
    out.push({ x, y, w, h, score });
  }
  return out;
}

export function confidentFaceCount(faces: unknown[]): number {
  return nmsCount(extractBoxes(faces));
}

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
          return confidentFaceCount(faces ?? []);
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

async function createMediapipe(): Promise<FaceEngine | null> {
  try {
    const vision = await import(
      /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
    );
    const { FaceDetector, FilesetResolver } = vision as {
      FaceDetector: {
        createFromOptions: (
          fileset: unknown,
          opts: unknown,
        ) => Promise<{
          detect?: (input: HTMLCanvasElement | HTMLVideoElement) => { detections?: unknown[] };
          detectForVideo?: (video: HTMLVideoElement, ts: number) => { detections?: unknown[] };
          close?: () => void;
        }>;
      };
      FilesetResolver: {
        forVisionTasks: (base: string) => Promise<unknown>;
      };
    };
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    let mode: "IMAGE" | "VIDEO" = "IMAGE";
    let detector: {
      detect?: (input: HTMLCanvasElement | HTMLVideoElement) => { detections?: unknown[] };
      detectForVideo?: (video: HTMLVideoElement, ts: number) => { detections?: unknown[] };
      close?: () => void;
    };
    try {
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: WEAK_SCORE,
      });
      mode = "IMAGE";
    } catch {
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: WEAK_SCORE,
      });
      mode = "VIDEO";
    }
    const canvas =
      typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;
    let lastTs = 0;
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
          let faces: unknown[] = [];
          if (mode === "IMAGE" && typeof detector.detect === "function") {
            if (canvas && ctx) {
              const w = Math.min(video.videoWidth, 320);
              const h =
                Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w) || 240;
              if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
              }
              ctx.drawImage(video, 0, 0, w, h);
              const result = detector.detect(canvas);
              faces = result?.detections ?? [];
            } else {
              const result = detector.detect(video);
              faces = result?.detections ?? [];
            }
          } else if (typeof detector.detectForVideo === "function") {
            const ts = Math.max(lastTs + 1, Math.round(performance.now()));
            lastTs = ts;
            const result = detector.detectForVideo(video, ts);
            faces = result?.detections ?? [];
          }
          return confidentFaceCount(faces);
        } catch {
          return null;
        }
      },
      close: () => {
        try {
          detector.close?.();
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

  for (let attempt = 0; attempt < 3; attempt++) {
    const engine = await withTimeout(createMediapipe(), MEDIAPIPE_LOAD_TIMEOUT_MS);
    if (engine) return engine;
    await new Promise((r) => window.setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

export function preloadFaceEngine(): void {
  if (typeof window === "undefined") return;
  void createFaceEngine().then((e) => e?.close());
}
