/**
 * Fast in-browser face COUNT for CBT (no frames uploaded).
 * Singleton MediaPipe engine — loads once, reused across exam mounts.
 * VIDEO mode + light NMS so multi-face is accurate and responsive.
 */

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const LOAD_TIMEOUT_MS = 18_000;
const MIN_SCORE = 0.25;
const NMS_IOU = 0.5;

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

/** Distinct faces only — never collapse real multi-face to 1. */
function nmsCount(boxes: Box[]): number {
  if (!boxes.length) return 0;
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const b of sorted) {
    if (b.score < MIN_SCORE) continue;
    if (b.w * b.h < 64) continue;
    if (kept.some((k) => iou(b, k) >= NMS_IOU)) continue;
    kept.push(b);
  }
  return kept.length;
}

function extractBoxes(faces: unknown[]): Box[] {
  const out: Box[] = [];
  for (const f of faces ?? []) {
    const any = f as {
      categories?: { score?: number }[];
      score?: number;
      boundingBox?: Record<string, number>;
      box?: Record<string, number>;
    };
    const score =
      any?.categories?.[0]?.score ?? (typeof any.score === "number" ? any.score : 0.55);
    const bb = any.boundingBox ?? any.box;
    if (!bb) continue;
    const x = Number(bb.xMin ?? bb.originX ?? bb.x ?? 0);
    const y = Number(bb.yMin ?? bb.originY ?? bb.y ?? 0);
    const w = Number(bb.width ?? 0);
    const h = Number(bb.height ?? 0);
    if (w < 6 || h < 6) continue;
    out.push({ x, y, w, h, score: Number(score) || 0 });
  }
  return out;
}

export function confidentFaceCount(faces: unknown[]): number {
  return nmsCount(extractBoxes(faces));
}

function videoReady(video: HTMLVideoElement): boolean {
  return !!video && video.readyState >= 2 && video.videoWidth >= 16 && video.videoHeight >= 16;
}

function createNative(): FaceEngine | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FD = (window as any).FaceDetector;
    if (typeof FD !== "function") return null;
    const detector = new FD({ fastMode: true, maxDetectedFaces: 10 });
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
          if (!Array.isArray(faces)) return 0;
          const boxes: Box[] = faces
            .map((f: { boundingBox?: DOMRectReadOnly }) => {
              const bb = f?.boundingBox;
              return {
                x: bb?.x ?? 0,
                y: bb?.y ?? 0,
                w: bb?.width ?? 0,
                h: bb?.height ?? 0,
                score: 0.7,
              };
            })
            .filter((b) => b.w >= 8 && b.h >= 8);
          return nmsCount(boxes);
        } catch {
          return null;
        }
      },
      close: () => {},
    };
  } catch {
    return null;
  }
}

async function createMediapipe(): Promise<FaceEngine | null> {
  try {
    const cdnUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
    const vision = await import(/* @vite-ignore */ cdnUrl);
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
      FilesetResolver: { forVisionTasks: (base: string) => Promise<unknown> };
    };
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

    let mode: "VIDEO" | "IMAGE" = "VIDEO";
    let detector: {
      detect?: (input: HTMLCanvasElement | HTMLVideoElement) => { detections?: unknown[] };
      detectForVideo?: (video: HTMLVideoElement, ts: number) => { detections?: unknown[] };
      close?: () => void;
    };
    try {
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: MIN_SCORE,
      });
      mode = "VIDEO";
    } catch {
      detector = await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: MIN_SCORE,
      });
      mode = "IMAGE";
    }

    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
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
          if (mode === "VIDEO" && typeof detector.detectForVideo === "function") {
            let ts = performance.now();
            if (ts <= lastTs) ts = lastTs + 1;
            lastTs = ts;
            faces = detector.detectForVideo(video, ts)?.detections ?? [];
          } else if (typeof detector.detect === "function") {
            if (canvas && ctx) {
              const maxW = 320;
              const w = Math.min(video.videoWidth || maxW, maxW);
              const h = Math.max(
                16,
                Math.round(((video.videoHeight || 240) / (video.videoWidth || 320)) * w),
              );
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              faces = detector.detect(canvas)?.detections ?? [];
            } else {
              faces = detector.detect(video)?.detections ?? [];
            }
          } else if (typeof detector.detectForVideo === "function") {
            let ts = performance.now();
            if (ts <= lastTs) ts = lastTs + 1;
            lastTs = ts;
            faces = detector.detectForVideo(video, ts)?.detections ?? [];
          }
          return confidentFaceCount(faces);
        } catch {
          return null;
        }
      },
      close: () => {},
    };
  } catch (e) {
    console.warn("[face-detector] MediaPipe failed", e);
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const t = window.setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, ms);
    p.then(
      (v) => {
        if (!done) {
          done = true;
          window.clearTimeout(t);
          resolve(v);
        }
      },
      () => {
        if (!done) {
          done = true;
          window.clearTimeout(t);
          resolve(null);
        }
      },
    );
  });
}

function preferNativeFirst(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return false;
  try {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    if (w.Capacitor?.isNativePlatform?.()) return false;
  } catch {
    /* ignore */
  }
  return true;
}

let sharedEngine: FaceEngine | null = null;
let sharedLoad: Promise<FaceEngine | null> | null = null;

export async function createFaceEngine(): Promise<FaceEngine | null> {
  if (sharedEngine) return sharedEngine;
  if (sharedLoad) return sharedLoad;

  sharedLoad = (async () => {
    const tryNative = () => createNative();
    const tryMp = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const engine = await withTimeout(createMediapipe(), LOAD_TIMEOUT_MS);
        if (engine) return engine;
        await new Promise((r) => window.setTimeout(r, 300 * (attempt + 1)));
      }
      return null;
    };

    let engine: FaceEngine | null = null;
    if (preferNativeFirst()) {
      engine = tryNative();
      if (!engine) engine = await tryMp();
    } else {
      engine = await tryMp();
      if (!engine) engine = tryNative();
    }
    sharedEngine = engine;
    return engine;
  })();

  return await sharedLoad;
}

export function preloadFaceEngine(): void {
  if (typeof window === "undefined") return;
  void createFaceEngine();
}
