import { useEffect, useRef, useState } from "react";
import {
  File,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type ViewerMaterial = {
  id: string;
  title: string;
  description: string | null;
  material_type: string;
  file_url: string | null;
  file_name: string | null;
  file_mime: string | null;
};

function typeLabel(t: string) {
  const map: Record<string, string> = {
    notes: "Notes",
    assignment: "Assignment",
    study_guide: "Study guide",
    past_question: "Past question",
    reading_tips: "Reading tips",
    other: "Other",
  };
  return map[t] || t;
}

function isPdfMaterial(m: ViewerMaterial) {
  const mime = (m.file_mime || "").toLowerCase();
  const name = (m.file_name || m.file_url || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

function isImageMaterial(m: ViewerMaterial) {
  const mime = (m.file_mime || "").toLowerCase();
  const name = (m.file_name || m.file_url || "").toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
}

/** In-app viewer: images, PDFs (pdf.js), text notes — stays on D4EXAM */
export function MaterialViewer({
  item,
  onClose,
  siblings,
  onNavigate,
}: {
  item: ViewerMaterial;
  onClose: () => void;
  siblings: ViewerMaterial[];
  onNavigate: (m: ViewerMaterial) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfDocRef = useRef<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(null);

  const idx = siblings.findIndex((s) => s.id === item.id);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < siblings.length - 1;

  useEffect(() => {
    setPdfPage(1);
    setPdfPages(0);
    setPdfError(null);
    pdfDocRef.current = null;
  }, [item.id]);

  useEffect(() => {
    if (!item.file_url || !isPdfMaterial(item)) return;
    let cancelled = false;
    (async () => {
      setPdfBusy(true);
      setPdfError(null);
      try {
        const pdfjs = await import("pdfjs-dist");
        const version = (pdfjs as { version?: string }).version ?? "5.1.91";
        if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
        }
        const task = pdfjs.getDocument({ url: item.file_url!, withCredentials: false });
        const doc = await task.promise;
        if (cancelled) return;
        pdfDocRef.current = doc as typeof pdfDocRef.current;
        setPdfPages(doc.numPages);
        setPdfPage(1);
      } catch (e) {
        if (!cancelled) setPdfError((e as Error).message || "Could not open PDF");
      } finally {
        if (!cancelled) setPdfBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.file_url, item.file_mime, item.file_name]);

  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || !isPdfMaterial(item)) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = pdfDocRef.current!;
        const page = (await doc.getPage(pdfPage)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number };
          render: (o: unknown) => { promise: Promise<void> };
        };
        const canvas = canvasRef.current!;
        const base = page.getViewport({ scale: 1 });
        const maxW = Math.min(window.innerWidth - 48, 900);
        const scale = Math.min(1.4, maxW / base.width);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx || cancelled) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) setPdfError((e as Error).message || "Could not render page");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfPage, pdfPages, item.id, item.file_url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(siblings[idx - 1]);
      if (e.key === "ArrowRight" && hasNext) onNavigate(siblings[idx + 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, hasPrev, hasNext, siblings, idx, onNavigate]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/70 p-2 sm:p-4"
      role="dialog"
      aria-modal
      aria-label={item.title}
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
            <p className="truncate text-[11px] text-slate-500">
              {typeLabel(item.material_type)}
              {item.file_name ? ` · ${item.file_name}` : ""}
            </p>
          </div>
          {item.file_url ? (
            <a
              href={item.file_url}
              download={item.file_name || undefined}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          ) : null}
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
          {!item.file_url ? (
            <div className="mx-auto max-w-2xl rounded-xl bg-white p-4 shadow-sm">
              <p className="whitespace-pre-wrap text-sm text-slate-800">
                {item.description || "No file attached — text note only."}
              </p>
            </div>
          ) : isImageMaterial(item) ? (
            <div className="flex justify-center">
              <img
                src={item.file_url}
                alt={item.title}
                className="max-h-[min(80vh,900px)] max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
          ) : isPdfMaterial(item) ? (
            <div className="flex flex-col items-center gap-2">
              {pdfBusy && (
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
                </p>
              )}
              {pdfError && <p className="text-sm text-red-600">{pdfError}</p>}
              <canvas ref={canvasRef} className="max-w-full rounded-lg bg-white shadow-md" />
              {pdfPages > 1 && (
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={pdfPage <= 1}
                    onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[5rem] text-center text-xs font-semibold text-slate-700">
                    {pdfPage} / {pdfPages}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={pdfPage >= pdfPages}
                    onClick={() => setPdfPage((p) => Math.min(pdfPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
              <File className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-800">Preview not available for this file type</p>
              <p className="mt-1 text-xs text-slate-500">Use Download to open it on your device.</p>
              {item.description ? (
                <p className="mt-3 whitespace-pre-wrap text-left text-sm text-slate-700">{item.description}</p>
              ) : null}
            </div>
          )}

          {item.file_url && item.description ? (
            <div className="mx-auto mt-3 max-w-2xl rounded-xl bg-white p-3 text-sm text-slate-700 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Note</p>
              <p className="mt-1 whitespace-pre-wrap">{item.description}</p>
            </div>
          ) : null}
        </div>

        {siblings.length > 1 && (
          <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-3 py-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasPrev}
              onClick={() => hasPrev && onNavigate(siblings[idx - 1])}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
            </Button>
            <span className="text-xs text-slate-500">
              {idx + 1} of {siblings.length}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasNext}
              onClick={() => hasNext && onNavigate(siblings[idx + 1])}
            >
              Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
