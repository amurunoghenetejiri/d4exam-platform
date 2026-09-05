import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Minus,
  Plus,
  Bookmark,
  MoreVertical,
  X,
  File,
  Share2,
  Save,
  Maximize2,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadMaterialAnn,
  saveMaterialAnn,
  type MaterialAnnState,
} from "@/lib/material-annotations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSessionUser } from "@/lib/session";
import { runImageOcr, downloadTextFile, openPrintableOcr } from "@/lib/material-ocr";
import { isMaterialOffline, saveMaterialOffline } from "@/lib/material-offline";
import { supabase } from "@/integrations/supabase/client";

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
  course_id?: string;
  ocr_text?: string | null;
  ocr_status?: string | null;
};

type Props = {
  item: ViewerMaterial;
  siblings: ViewerMaterial[];
  courseLabel?: string | null;
  onClose: () => void;
  onNavigate: (m: ViewerMaterial) => void;
  onItemPatch?: (id: string, patch: Partial<ViewerMaterial>) => void;
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

export function MaterialViewer({ item, siblings, courseLabel, onClose, onNavigate, onItemPatch }: Props) {
  const { data: session } = useSessionUser();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<{ numPages: number; getPage: (n: number) => Promise<any> } | null>(null);

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annState, setAnnState] = useState<MaterialAnnState>(() => loadMaterialAnn(item.id));
  const [moreOpen, setMoreOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [goPageOpen, setGoPageOpen] = useState(false);
  const [goPage, setGoPage] = useState("");
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrDraft, setOcrDraft] = useState(item.ocr_text || "");
  const [ocrStatusMsg, setOcrStatusMsg] = useState("");
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [imgScale, setImgScale] = useState(1);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const lastTapRef = useRef(0);
  const suppressToggleRef = useRef(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("d4-material-reader-open");
    document.documentElement.classList.add("d4-material-reader-open");

    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const prevTheme = meta?.getAttribute("content") || null;
    if (meta) meta.setAttribute("content", "#000000");

    void (async () => {
      try {
        const { isNativeShell } = await import("@/native/platform");
        if (!isNativeShell()) return;
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        try {
          await StatusBar.setOverlaysWebView({ overlay: true });
        } catch {
          /* older plugin */
        }
        await StatusBar.setBackgroundColor({ color: "#000000" });
        await StatusBar.setStyle({ style: Style.Dark });
      } catch {
        /* web / missing plugin */
      }
    })();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.classList.remove("d4-material-reader-open");
      document.documentElement.classList.remove("d4-material-reader-open");
      if (meta && prevTheme) meta.setAttribute("content", prevTheme);
      void (async () => {
        try {
          const { isNativeShell } = await import("@/native/platform");
          if (!isNativeShell()) return;
          const { StatusBar, Style } = await import("@capacitor/status-bar");
          const { applyNativeStatusBar } = await import("@/native/statusBar");
          try {
            await StatusBar.setOverlaysWebView({ overlay: false });
          } catch {
            /* ignore */
          }
          await applyNativeStatusBar();
          await StatusBar.setStyle({ style: Style.Dark });
        } catch {
          /* ignore */
        }
      })();
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setHintVisible(false), 2800);
    return () => window.clearTimeout(t);
  }, [item.id]);

  useEffect(() => {
    const s = loadMaterialAnn(item.id);
    setAnnState(s);
    setPage(s.lastPage || 1);
    setZoom(1);
    setImgScale(1);
    setImgOffset({ x: 0, y: 0 });
    setError(null);
    pdfDocRef.current = null;
    setOcrDraft(item.ocr_text || "");
    setChromeVisible(false);
    setMoreOpen(false);
    setHintVisible(true);
  }, [item.id, item.ocr_text]);

  useEffect(() => {
    saveMaterialAnn({ ...annState, materialId: item.id, lastPage: page });
  }, [annState, item.id, page]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.userId) return;
      const off = await isMaterialOffline(session.userId, item.id);
      if (!cancelled) setOfflineSaved(off);
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id, session?.userId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (ocrOpen) {
          setOcrOpen(false);
          return;
        }
        if (moreOpen) {
          setMoreOpen(false);
          return;
        }
        if (chromeVisible) {
          setChromeVisible(false);
          return;
        }
        onClose();
      } else if (e.key === " " || e.key === "f" || e.key === "F") {
        if (ocrOpen || goPageOpen) return;
        e.preventDefault();
        setChromeVisible((v) => !v);
      } else if (e.key === "ArrowLeft" && pages > 0) {
        setPage((p) => Math.max(1, p - 1));
      } else if (e.key === "ArrowRight" && pages > 0) {
        setPage((p) => Math.min(pages, p + 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chromeVisible, moreOpen, ocrOpen, goPageOpen, onClose, pages]);

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
      const maxW = Math.min((wrapRef.current?.clientWidth || 900) - 16, 1100);
      const maxH = Math.max((wrapRef.current?.clientHeight || 700) - 16, 200);
      const fit = Math.min(maxW / base.width, maxH / base.height);
      const scale = fit * zoom;
      const viewport = pg.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pg.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) {
      setError((e as Error).message || "Render failed");
    }
  }, [page, zoom, item]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

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

  async function startOcr() {
    if (!item.file_url || !isImage(item)) {
      toast.error("OCR is available for image materials");
      return;
    }
    setOcrOpen(true);
    setOcrBusy(true);
    setOcrProgress(0);
    setChromeVisible(true);
    try {
      const text = await runImageOcr(item.file_url, (p) => {
        setOcrProgress(Math.round((p.progress || 0) * 100));
        setOcrStatusMsg(String(p.status || "").replace(/_/g, " "));
      });
      setOcrDraft(text || "");
      if (!text) toast.message("No text detected — try a clearer photo");
    } catch (e) {
      toast.error((e as Error).message || "OCR failed");
    } finally {
      setOcrBusy(false);
    }
  }

  async function saveOcr() {
    try {
      const { error: err } = await supabase
        .from("course_materials")
        .update({ ocr_text: ocrDraft, ocr_status: "done" } as never)
        .eq("id", item.id);
      if (err) throw err;
      onItemPatch?.(item.id, { ocr_text: ocrDraft, ocr_status: "done" });
      toast.success("Converted text saved");
      setOcrOpen(false);
    } catch {
      downloadTextFile(`${(item.title || "notes").replace(/[^\w\- ]+/g, "").trim() || "notes"}-ocr`, ocrDraft);
      toast.message("Downloaded as text (server save needs OCR migration)");
    }
  }

  async function handleSaveOffline() {
    if (!session?.userId || !item.file_url) {
      toast.error("Cannot save offline");
      return;
    }
    try {
      await saveMaterialOffline(
        session.userId,
        {
          id: item.id,
          title: item.title,
          file_url: item.file_url,
          file_name: item.file_name,
          file_mime: item.file_mime,
        },
        session.schoolId,
      );
      setOfflineSaved(true);
      toast.success("Saved for offline reading");
    } catch (e) {
      toast.error((e as Error).message || "Offline save failed");
    }
  }

  function resetZoom() {
    setZoom(1);
    setImgScale(1);
    setImgOffset({ x: 0, y: 0 });
  }

  function onImgPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    panRef.current = { x: e.clientX, y: e.clientY, ox: imgOffset.x, oy: imgOffset.y };
  }
  function onImgPointerMove(e: React.PointerEvent) {
    if (!panRef.current || imgScale <= 1) return;
    suppressToggleRef.current = true;
    setImgOffset({
      x: panRef.current.ox + (e.clientX - panRef.current.x),
      y: panRef.current.oy + (e.clientY - panRef.current.y),
    });
  }
  function onImgPointerUp() {
    panRef.current = null;
    window.setTimeout(() => {
      suppressToggleRef.current = false;
    }, 80);
  }
  function onImgTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchRef.current = { dist: d, scale: imgScale };
      suppressToggleRef.current = true;
    }
  }
  function onImgTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      setImgScale(Math.min(5, Math.max(0.5, pinchRef.current.scale * (d / pinchRef.current.dist))));
    }
  }
  function onImgDoubleClick() {
    if (imgScale > 1.1) {
      setImgScale(1);
      setImgOffset({ x: 0, y: 0 });
    } else setImgScale(2.2);
  }

  function onStagePointerUp(e: React.PointerEvent) {
    if (suppressToggleRef.current) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-reader-chrome]")) return;
    if (moreOpen) {
      setMoreOpen(false);
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    setChromeVisible((v) => !v);
    setHintVisible(false);
  }

  const bookmarked = annState.bookmarks.includes(page);
  const idx = siblings.findIndex((s) => s.id === item.id);
  const prevItem = idx > 0 ? siblings[idx - 1] : null;
  const nextItem = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const reader = (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal
      aria-label="Material reader"
      style={{
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: "100vw",
        height: "100dvh",
        maxHeight: "100dvh",
        background: "#000000",
      }}
      onPointerUp={onStagePointerUp}
    >
      <header
        data-reader-chrome
        className={cn(
          "absolute left-0 right-0 top-0 z-20 flex items-center gap-2 border-b border-white/10 bg-[#0b1b3a]/95 px-2 py-2 backdrop-blur-md transition-all duration-200 sm:px-3",
          chromeVisible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
        )}
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top,0px))", background: "rgba(11,27,58,0.98)" }}
      >
        <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-white hover:bg-white/10" onClick={onClose} aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">{item.title || item.file_name}</p>
          <p className="truncate text-[11px] text-white/55">
            {[
              courseLabel,
              isPdf(item) ? `PDF${pages ? ` · ${pages} pages` : ""}` : isImage(item) ? "IMAGE" : "FILE",
              offlineSaved ? "Offline" : null,
            ]
              .filter(Boolean)
              .join(" · ") || typeLabel(item.material_type)}
          </p>
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-white hover:bg-white/10" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {busy && (
          <p className="flex items-center gap-2 text-sm text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </p>
        )}
        {error && <p className="px-6 text-center text-sm text-red-300">{error}</p>}

        {!item.file_url && !busy && (
          <div className="mx-auto max-w-lg rounded-xl bg-white p-6 text-slate-800 shadow">
            <p className="whitespace-pre-wrap text-sm">{item.ocr_text || item.description || "No file attached."}</p>
          </div>
        )}

        {item.file_url && isImage(item) && (
          <div
            className="flex h-full w-full touch-none items-center justify-center"
            onPointerDown={onImgPointerDown}
            onPointerMove={onImgPointerMove}
            onPointerUp={onImgPointerUp}
            onPointerCancel={onImgPointerUp}
            onTouchStart={onImgTouchStart}
            onTouchMove={onImgTouchMove}
            onDoubleClick={onImgDoubleClick}
          >
            <img
              src={item.file_url}
              alt={item.title}
              draggable={false}
              className="h-auto max-h-full w-auto max-w-full select-none object-contain"
              style={{
                transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${imgScale * zoom})`,
                transformOrigin: "center center",
              }}
            />
          </div>
        )}

        {item.file_url && isPdf(item) && !error && (
          <div className="flex h-full w-full items-center justify-center overflow-auto p-2 sm:p-4">
            <canvas ref={canvasRef} className="mx-auto block max-w-full bg-white shadow-2xl" />
          </div>
        )}

        {item.file_url && !isPdf(item) && !isImage(item) && (
          <div className="mx-auto max-w-md rounded-xl bg-white p-8 text-center text-slate-800 shadow">
            <File className="mx-auto h-12 w-12 text-slate-400" />
            <p className="mt-3 font-semibold">Preview not available for this file type</p>
            <p className="mt-1 text-sm text-slate-500">Download to open on your device.</p>
            <Button className="mt-4" data-reader-chrome onClick={download}>
              <Download className="mr-1 h-4 w-4" /> Download
            </Button>
          </div>
        )}

        {pages > 0 && !chromeVisible && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
            {page} / {pages}
          </div>
        )}

        {hintVisible && !chromeVisible && (
          <div className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2 text-xs font-medium tracking-wide text-white/40">
            Tap for options
          </div>
        )}
      </div>

      <footer
        data-reader-chrome
        className={cn(
          "absolute bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-[#0b1b3a]/95 backdrop-blur-md transition-all duration-200",
          chromeVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
        )}
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom,0px))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-1 px-2 py-2 sm:px-4">
          {pages > 0 ? (
            <div className="flex items-center gap-0.5">
              <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums">{page}/{pages}</span>
              <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5">
              <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" disabled={!prevItem} onClick={() => prevItem && onNavigate(prevItem)} aria-label="Previous material">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" disabled={!nextItem} onClick={() => nextItem && onNavigate(nextItem)} aria-label="Next material">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" onClick={() => { if (isImage(item)) setImgScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2))); else setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2))); }} aria-label="Zoom out">
              <Minus className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" onClick={resetZoom} aria-label="Fit">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" onClick={() => { if (isImage(item)) setImgScale((s) => Math.min(5, +(s + 0.25).toFixed(2))); else setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2))); }} aria-label="Zoom in">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1">
            {isImage(item) && (
              <Button type="button" size="sm" className="h-9 rounded-full bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500" onClick={() => void startOcr()}>
                <Type className="mr-1 h-3.5 w-3.5" /> OCR
              </Button>
            )}
            <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" onClick={() => void share()} aria-label="Share">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" onClick={download} aria-label="Download">
              <Download className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button type="button" size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10" onClick={() => setMoreOpen((v) => !v)} aria-label="More options">
                <MoreVertical className="h-4 w-4" />
              </Button>
              {moreOpen && (
                <div className="absolute bottom-12 right-0 z-30 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0b1b3a] py-1 text-sm shadow-2xl">
                  {isImage(item) && (
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { setMoreOpen(false); void startOcr(); }}>
                      <Type className="h-4 w-4 opacity-70" /> Convert handwriting (OCR)
                    </button>
                  )}
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { setMoreOpen(false); void handleSaveOffline(); }}>
                    <Save className="h-4 w-4 opacity-70" /> {offlineSaved ? "Re-save offline" : "Save offline"}
                  </button>
                  {pages > 0 && (
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { setGoPage(String(page)); setGoPageOpen(true); setMoreOpen(false); }}>
                      Go to page…
                    </button>
                  )}
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { resetZoom(); setMoreOpen(false); }}>
                    Fit / reset zoom
                  </button>
                  {pages > 0 && (
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { toggleBookmark(); setMoreOpen(false); }}>
                      <Bookmark className={cn("h-4 w-4 opacity-70", bookmarked && "fill-amber-400 text-amber-400")} />
                      {bookmarked ? "Remove bookmark" : "Bookmark page"}
                    </button>
                  )}
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { setMoreOpen(false); void share(); }}>
                    <Share2 className="h-4 w-4 opacity-70" /> Share
                  </button>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/10" onClick={() => { setMoreOpen(false); download(); }}>
                    <Download className="h-4 w-4 opacity-70" /> Download
                  </button>
                  {item.description && (
                    <div className="border-t border-white/10 px-3 py-2 text-[11px] leading-snug text-white/50">{item.description}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </footer>

      {goPageOpen && (
        <div data-reader-chrome className="absolute inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setGoPageOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-[#0b1b3a] p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-semibold">Go to page</p>
            <div className="flex gap-2">
              <input className="flex-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm" value={goPage} inputMode="numeric" onChange={(e) => setGoPage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const n = parseInt(goPage, 10); if (n >= 1 && n <= pages) setPage(n); setGoPageOpen(false); } }} autoFocus />
              <Button type="button" onClick={() => { const n = parseInt(goPage, 10); if (n >= 1 && n <= pages) setPage(n); setGoPageOpen(false); }}>Go</Button>
            </div>
            <p className="mt-2 text-[11px] text-white/45">1 – {pages}</p>
          </div>
        </div>
      )}

      {ocrOpen && (
        <div data-reader-chrome className="absolute inset-0 z-50 flex flex-col bg-[#0b1220]">
          <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0b1b3a] px-2 py-2">
            <Button type="button" size="icon" variant="ghost" className="text-white" onClick={() => setOcrOpen(false)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Handwriting → Text</p>
              <p className="text-[11px] text-white/55">{ocrBusy ? `${ocrStatusMsg} ${ocrProgress}%` : "Review and edit before saving"}</p>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {ocrBusy ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/80">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                <p className="text-sm">{ocrStatusMsg}</p>
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${ocrProgress}%` }} />
                </div>
              </div>
            ) : (
              <div className="mx-auto grid max-w-4xl gap-3 lg:grid-cols-2">
                {item.file_url && isImage(item) && (
                  <div className="overflow-hidden rounded-xl bg-slate-900">
                    <img src={item.file_url} alt="Original" className="max-h-[40vh] w-full object-contain lg:max-h-[70vh]" />
                    <p className="px-3 py-2 text-center text-[11px] text-white/50">Original image (kept intact)</p>
                  </div>
                )}
                <div className="flex flex-col rounded-xl bg-white p-3 text-slate-900">
                  <p className="mb-2 text-xs font-semibold text-slate-500">Converted text (editable)</p>
                  <textarea className="min-h-[40vh] flex-1 resize-y rounded-lg border border-slate-200 p-3 text-sm leading-relaxed lg:min-h-[60vh]" value={ocrDraft} onChange={(e) => setOcrDraft(e.target.value)} placeholder="Recognized text appears here…" />
                </div>
              </div>
            )}
          </div>
          {!ocrBusy && (
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/10 bg-[#0b1b3a] p-3">
              <Button type="button" variant="outline" className="border-white/20 bg-transparent text-white" onClick={() => setOcrOpen(false)}>Discard</Button>
              <Button type="button" variant="secondary" onClick={() => downloadTextFile(`${(item.title || "notes").replace(/[^\w\- ]+/g, "").trim() || "notes"}-ocr`, ocrDraft)}>Download .txt</Button>
              <Button type="button" variant="secondary" onClick={() => openPrintableOcr(item.title, ocrDraft)}>Print / PDF</Button>
              <Button type="button" className="ml-auto" onClick={() => void saveOcr()} disabled={!ocrDraft.trim()}>Save conversion</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(reader, document.body);
}
