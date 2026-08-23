import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Minus,
  Plus,
  Search,
  Bookmark,
  MoreVertical,
  X,
  File,
  Hand,
  MousePointer2,
  Highlighter,
  Type,
  Eraser,
  Pen,
  Grid3X3,
  Share2,
  Undo2,
  Redo2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadMaterialAnn,
  saveMaterialAnn,
  uid,
  type AnnTool,
  type AnnotationStroke,
  type MaterialAnnState,
} from "@/lib/material-annotations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type ViewerMaterial = {
  id: string;
  title: string;
  description: string | null;
  material_type: string;
  file_url: string | null;
  file_name: string | null;
  file_mime: string | null;
  uploader_name?: string | null;
  created_at?: string;
  file_size?: number | null;
};

type Props = {
  item: ViewerMaterial;
  siblings: ViewerMaterial[];
  onClose: () => void;
  onNavigate: (m: ViewerMaterial) => void;
};

function isPdf(m: ViewerMaterial) {
  const mime = (m.file_mime || "").toLowerCase();
  const name = (m.file_name || m.file_url || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

function isImage(m: ViewerMaterial) {
  const mime = (m.file_mime || "").toLowerCase();
  const name = (m.file_name || m.file_url || "").toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
}

const COLORS = ["#ef4444", "#3b82f6", "#06b6d4", "#a855f7", "#f59e0b", "#111827"];

export function MaterialViewer({ item, siblings, onClose, onNavigate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const annCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<{ numPages: number; getPage: (n: number) => Promise<any> } | null>(null);

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<AnnTool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [thickness, setThickness] = useState(3);
  const [annState, setAnnState] = useState<MaterialAnnState>(() => loadMaterialAnn(item.id));
  const [showThumbs, setShowThumbs] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pageSize, setPageSize] = useState({ w: 600, h: 800 });
  const drawingRef = useRef<{ points: { x: number; y: number }[] } | null>(null);
  const historyRef = useRef<AnnotationStroke[][]>([]);
  const redoRef = useRef<AnnotationStroke[][]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [goPage, setGoPage] = useState("");

  useEffect(() => {
    const s = loadMaterialAnn(item.id);
    setAnnState(s);
    setPage(s.lastPage || 1);
    setZoom(1);
    setError(null);
    pdfDocRef.current = null;
    historyRef.current = [];
    redoRef.current = [];
  }, [item.id]);

  useEffect(() => {
    saveMaterialAnn({ ...annState, materialId: item.id, lastPage: page });
  }, [annState, item.id, page]);

  useEffect(() => {
    if (!item.file_url || !isPdf(item)) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const pdfjs = await import("pdfjs-dist");
        const version = (pdfjs as { version?: string }).version ?? "5.1.91";
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
        }
        const doc = await pdfjs.getDocument({ url: item.file_url!, withCredentials: false }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setPages(doc.numPages);
        setPage((p) => Math.min(Math.max(1, p), doc.numPages));
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "Could not open PDF");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.file_url, item.file_mime, item.file_name]);

  const renderPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current || !isPdf(item)) return;
    try {
      const doc = pdfDocRef.current;
      const pg = await doc.getPage(page);
      const base = pg.getViewport({ scale: 1 });
      const maxW = Math.min((wrapRef.current?.clientWidth || 800) - 24, 960);
      const scale = (maxW / base.width) * zoom;
      const viewport = pg.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setPageSize({ w: viewport.width, h: viewport.height });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pg.render({ canvasContext: ctx, viewport }).promise;
      const ann = annCanvasRef.current;
      if (ann) {
        ann.width = viewport.width;
        ann.height = viewport.height;
        redrawAnnotations(ann, viewport.width, viewport.height, page, annState.strokes);
      }
    } catch (e) {
      setError((e as Error).message || "Render failed");
    }
  }, [page, zoom, item, annState.strokes]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  function redrawAnnotations(
    canvas: HTMLCanvasElement,
    w: number,
    h: number,
    pageNum: number,
    strokes: AnnotationStroke[],
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (const s of strokes) {
      if (s.page !== pageNum) continue;
      if (s.tool === "text" && s.text != null && s.x != null && s.y != null) {
        ctx.fillStyle = s.color;
        ctx.font = `${Math.max(14, s.width * 5)}px sans-serif`;
        ctx.fillText(s.text, s.x * w, s.y * h);
        continue;
      }
      if (!s.points?.length) continue;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.tool === "highlight" ? s.width * 4 : s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = s.tool === "highlight" ? 0.35 : 1;
      s.points.forEach((pt, i) => {
        const x = pt.x * w;
        const y = pt.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function normPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function pushHistory() {
    historyRef.current.push(annState.strokes.map((s) => ({ ...s, points: s.points ? [...s.points] : undefined })));
    if (historyRef.current.length > 40) historyRef.current.shift();
    redoRef.current = [];
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "select" || tool === "pan") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = normPoint(e);
    if (tool === "eraser") {
      pushHistory();
      setAnnState((prev) => ({
        ...prev,
        strokes: prev.strokes.filter((s) => {
          if (s.page !== page) return true;
          if (s.tool === "text" && s.x != null && s.y != null) {
            return Math.hypot((s.x - pt.x) * pageSize.w, (s.y - pt.y) * pageSize.h) > 24;
          }
          if (!s.points?.length) return true;
          return !s.points.some((p) => Math.hypot((p.x - pt.x) * pageSize.w, (p.y - pt.y) * pageSize.h) < 16);
        }),
      }));
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Add text note");
      if (!text?.trim()) return;
      pushHistory();
      const stroke: AnnotationStroke = {
        id: uid(),
        page,
        tool: "text",
        color,
        width: thickness,
        text: text.trim(),
        x: pt.x,
        y: pt.y,
      };
      setAnnState((prev) => ({ ...prev, strokes: [...prev.strokes, stroke] }));
      return;
    }
    if (tool === "pen" || tool === "highlight") {
      drawingRef.current = { points: [pt] };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || (tool !== "pen" && tool !== "highlight")) return;
    drawingRef.current.points.push(normPoint(e));
    const ann = annCanvasRef.current;
    if (!ann) return;
    redrawAnnotations(ann, ann.width, ann.height, page, annState.strokes);
    const ctx = ann.getContext("2d");
    if (!ctx) return;
    const pts = drawingRef.current.points;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = tool === "highlight" ? thickness * 4 : thickness;
    ctx.lineCap = "round";
    ctx.globalAlpha = tool === "highlight" ? 0.35 : 1;
    pts.forEach((pt, i) => {
      const x = pt.x * ann.width;
      const y = pt.y * ann.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function onPointerUp() {
    if (!drawingRef.current || (tool !== "pen" && tool !== "highlight")) return;
    const points = drawingRef.current.points;
    drawingRef.current = null;
    if (points.length < 2) return;
    pushHistory();
    const stroke: AnnotationStroke = {
      id: uid(),
      page,
      tool: tool === "highlight" ? "highlight" : "pen",
      color,
      width: thickness,
      points,
    };
    setAnnState((prev) => ({ ...prev, strokes: [...prev.strokes, stroke] }));
  }

  function undo() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push(annState.strokes);
    setAnnState((s) => ({ ...s, strokes: prev }));
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(annState.strokes);
    setAnnState((s) => ({ ...s, strokes: next }));
  }

  function toggleBookmark() {
    setAnnState((prev) => {
      const has = prev.bookmarks.includes(page);
      return {
        ...prev,
        bookmarks: has ? prev.bookmarks.filter((p) => p !== page) : [...prev.bookmarks, page].sort((a, b) => a - b),
      };
    });
    toast.success(annState.bookmarks.includes(page) ? "Bookmark removed" : "Page bookmarked");
  }

  function download() {
    if (!item.file_url) return;
    const a = document.createElement("a");
    a.href = item.file_url;
    a.download = item.file_name || item.title || "material";
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function share() {
    if (!item.file_url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url: item.file_url });
      } else {
        await navigator.clipboard.writeText(item.file_url);
        toast.success("Link copied");
      }
    } catch {
      /* cancelled */
    }
  }

  const pageStrokes = annState.strokes.filter((s) => s.page === page).length;
  const bookmarked = annState.bookmarks.includes(page);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal>
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-2 py-2 sm:px-3">
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/10" onClick={onClose} aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold">{item.file_name || item.title}</p>
            <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold uppercase">
              {isPdf(item) ? "PDF" : isImage(item) ? "IMG" : "FILE"}
            </span>
          </div>
          <p className="truncate text-[11px] text-white/50">
            {[item.uploader_name, item.created_at ? new Date(item.created_at).toLocaleDateString() : null]
              .filter(Boolean)
              .join(" · ") || typeLabel(item.material_type)}
          </p>
        </div>
        {pages > 0 && (
          <div className="hidden items-center gap-1 rounded-lg bg-white/10 px-1 sm:flex">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs font-semibold">
              {page} / {pages}
            </span>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="hidden items-center gap-1 rounded-lg bg-white/10 px-1 sm:flex">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[3rem] text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Button type="button" size="icon" variant="ghost" className="hidden h-9 w-9 text-white hover:bg-white/10 sm:inline-flex" onClick={() => setSearchOpen((v) => !v)}>
          <Search className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className={cn("h-9 w-9 text-white hover:bg-white/10", bookmarked && "text-amber-400")} onClick={toggleBookmark}>
          <Bookmark className={cn("h-4 w-4", bookmarked && "fill-current")} />
        </Button>
        <Button type="button" size="sm" variant="outline" className="hidden border-white/20 bg-white/10 text-white hover:bg-white/20 sm:inline-flex" onClick={download}>
          <Download className="mr-1 h-3.5 w-3.5" /> Download
        </Button>
        <div className="relative">
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/10" onClick={() => setMoreOpen((v) => !v)}>
            <MoreVertical className="h-4 w-4" />
          </Button>
          {moreOpen && (
            <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-white/10 bg-slate-900 py-1 text-sm shadow-xl">
              <button type="button" className="flex w-full px-3 py-2 hover:bg-white/10" onClick={() => { setGoPage(String(page)); setSearchOpen(true); setMoreOpen(false); }}>Go to page</button>
              <button type="button" className="flex w-full px-3 py-2 hover:bg-white/10" onClick={() => { setZoom(1); setMoreOpen(false); }}>Reset zoom</button>
              <button type="button" className="flex w-full px-3 py-2 hover:bg-white/10" onClick={() => { toggleBookmark(); setMoreOpen(false); }}>
                {bookmarked ? "Remove bookmark" : "Add bookmark"}
              </button>
              <button type="button" className="flex w-full px-3 py-2 hover:bg-white/10" onClick={() => { void share(); setMoreOpen(false); }}>Share</button>
              <button type="button" className="flex w-full px-3 py-2 hover:bg-white/10" onClick={() => { download(); setMoreOpen(false); }}>Download</button>
              <button type="button" className="flex w-full px-3 py-2 hover:bg-white/10" onClick={() => { window.print(); setMoreOpen(false); }}>Print</button>
            </div>
          )}
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/10" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </header>

      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-900 px-3 py-2">
          <span className="text-xs text-white/60">Go to page</span>
          <input
            className="w-20 rounded border border-white/20 bg-black/40 px-2 py-1 text-sm"
            value={goPage}
            onChange={(e) => setGoPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseInt(goPage, 10);
                if (n >= 1 && n <= pages) setPage(n);
                setSearchOpen(false);
              }
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => { const n = parseInt(goPage, 10); if (n >= 1 && n <= pages) setPage(n); setSearchOpen(false); }}>
            Go
          </Button>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/10 bg-slate-900/80 px-2 py-1.5">
        {(
          [
            ["select", MousePointer2],
            ["pan", Hand],
            ["pen", Pen],
            ["highlight", Highlighter],
            ["text", Type],
            ["eraser", Eraser],
          ] as const
        ).map(([t, Icon]) => (
          <button
            key={t}
            type="button"
            title={t}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-lg",
              tool === t ? "bg-violet-600 text-white" : "text-white/70 hover:bg-white/10",
            )}
            onClick={() => {
              setTool(t);
              if (t === "pen" || t === "highlight" || t === "text" || t === "eraser") setShowTools(true);
            }}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={cn("h-6 w-6 rounded-full border-2", color === c ? "border-white" : "border-transparent")}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={c}
          />
        ))}
        <input
          type="range"
          min={1}
          max={12}
          value={thickness}
          onChange={(e) => setThickness(Number(e.target.value))}
          className="mx-2 w-20 accent-violet-500"
          title="Thickness"
        />
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={undo} title="Undo">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={redo} title="Redo">
          <Redo2 className="h-4 w-4" />
        </Button>
        <span className="ml-auto text-[11px] text-white/50">
          {pageStrokes} mark{pageStrokes === 1 ? "" : "s"} on page · auto-saved
        </span>
        <Button type="button" size="sm" className="bg-violet-600 font-semibold hover:bg-violet-500" onClick={() => { saveMaterialAnn({ ...annState, materialId: item.id, lastPage: page }); toast.success("Annotations saved"); }}>
          <Save className="mr-1 h-3.5 w-3.5" /> Save
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {showThumbs && pages > 0 && (
          <aside className="hidden w-28 shrink-0 overflow-y-auto border-r border-white/10 bg-black/40 p-2 sm:block">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={cn(
                  "mb-2 w-full rounded border py-3 text-xs font-semibold",
                  n === page ? "border-violet-500 bg-violet-600/30" : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
                onClick={() => setPage(n)}
              >
                {n}
                {annState.bookmarks.includes(n) ? " ★" : ""}
              </button>
            ))}
          </aside>
        )}

        <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-auto bg-slate-800/80 p-2 sm:p-4">
          {busy && (
            <p className="flex items-center justify-center gap-2 py-20 text-sm text-white/70">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </p>
          )}
          {error && <p className="py-12 text-center text-sm text-red-300">{error}</p>}

          {!item.file_url && (
            <div className="mx-auto max-w-lg rounded-xl bg-white p-6 text-slate-800 shadow">
              <p className="whitespace-pre-wrap text-sm">{item.description || "No file attached."}</p>
            </div>
          )}

          {item.file_url && isImage(item) && (
            <div className="flex justify-center">
              <img src={item.file_url} alt={item.title} className="max-h-full max-w-full rounded shadow-lg" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }} />
            </div>
          )}

          {item.file_url && isPdf(item) && !error && (
            <div className="relative mx-auto w-fit shadow-2xl">
              <canvas ref={canvasRef} className="block bg-white" />
              <canvas
                ref={annCanvasRef}
                className="absolute left-0 top-0 touch-none"
                style={{
                  width: pageSize.w,
                  height: pageSize.h,
                  cursor: tool === "pen" || tool === "highlight" ? "crosshair" : tool === "text" ? "text" : tool === "eraser" ? "cell" : "default",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          )}

          {item.file_url && !isPdf(item) && !isImage(item) && (
            <div className="mx-auto max-w-md rounded-xl bg-white p-8 text-center text-slate-800 shadow">
              <File className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-3 font-semibold">Preview not available for this file type</p>
              <p className="mt-1 text-sm text-slate-500">Download to open on your device.</p>
              <Button className="mt-4" onClick={download}>
                <Download className="mr-1 h-4 w-4" /> Download
              </Button>
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-around border-t border-white/10 bg-slate-950 px-2 py-2 sm:hidden">
        <button type="button" className="flex flex-col items-center gap-0.5 text-[10px] text-white/80" onClick={() => setShowThumbs((v) => !v)}>
          <Grid3X3 className="h-5 w-5" /> Thumbnails
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5 text-[10px] text-white/80" onClick={() => void share()}>
          <Share2 className="h-5 w-5" /> Share
        </button>
        <button
          type="button"
          className="grid h-12 w-12 place-items-center rounded-full bg-violet-600 shadow-lg"
          onClick={() => {
            setShowTools(true);
            setTool("pen");
          }}
        >
          <Pen className="h-5 w-5" />
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5 text-[10px] text-white/80" onClick={() => { saveMaterialAnn({ ...annState, materialId: item.id, lastPage: page }); toast.success("Saved"); }}>
          <Save className="h-5 w-5" /> Save
        </button>
        <button type="button" className="flex flex-col items-center gap-0.5 text-[10px] text-white/80" onClick={download}>
          <Download className="h-5 w-5" /> Download
        </button>
      </footer>

      {pages > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold sm:hidden">
          {page} / {pages}
        </div>
      )}
    </div>
  );
}

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
