/** Persist per-material annotations & bookmarks in localStorage (per browser user). */

export type AnnTool = "select" | "pan" | "pen" | "highlight" | "text" | "eraser";

export type AnnotationStroke = {
  id: string;
  page: number;
  tool: "pen" | "highlight" | "text";
  color: string;
  width: number;
  /** Normalized 0–1 coords relative to page */
  points?: { x: number; y: number }[];
  text?: string;
  x?: number;
  y?: number;
};

export type MaterialAnnState = {
  materialId: string;
  strokes: AnnotationStroke[];
  bookmarks: number[];
  lastPage: number;
  updatedAt: number;
};

const key = (id: string) => `d4exam.material.ann.${id}`;

export function loadMaterialAnn(materialId: string): MaterialAnnState {
  try {
    const raw = localStorage.getItem(key(materialId));
    if (raw) {
      const parsed = JSON.parse(raw) as MaterialAnnState;
      if (parsed && parsed.materialId === materialId) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { materialId, strokes: [], bookmarks: [], lastPage: 1, updatedAt: Date.now() };
}

export function saveMaterialAnn(state: MaterialAnnState) {
  try {
    state.updatedAt = Date.now();
    localStorage.setItem(key(state.materialId), JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
