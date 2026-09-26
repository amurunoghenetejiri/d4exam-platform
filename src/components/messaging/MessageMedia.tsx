import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Download, Mic, Pause, Play, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function fmtDur(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function WaveBars({ active, light }: { active?: boolean; light?: boolean }) {
  return (
    <div className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden">
      {Array.from({ length: 28 }).map((_, i) => {
        const h = 4 + ((i * 11) % 18);
        return (
          <span
            key={i}
            className={cn("w-[2px] shrink-0 rounded-full", light ? "bg-white/80" : "bg-blue-400/80", active && "animate-pulse")}
            style={{ height: h, animationDelay: `${i * 30}ms` }}
          />
        );
      })}
    </div>
  );
}

/** Seekable progress track with draggable ball */
function SeekBar({
  value,
  max,
  light,
  onSeek,
}: {
  value: number;
  max: number;
  light?: boolean;
  onSeek: (t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || max <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * max);
  };

  return (
    <div
      ref={trackRef}
      className={cn("relative h-5 flex-1 cursor-pointer touch-none", light ? "" : "")}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        seekFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons !== 1) return;
        seekFromClientX(e.clientX);
      }}
    >
      <div className={cn("absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full", light ? "bg-white/30" : "bg-slate-200")} />
      <div
        className={cn("absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full", light ? "bg-white" : "bg-[#2563eb]")}
        style={{ width: `${pct}%` }}
      />
      <div
        className={cn(
          "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow",
          light ? "bg-white" : "bg-[#2563eb]",
        )}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

export function VoiceBubble({
  src,
  mine,
  timeLabel,
  tick,
  id,
}: {
  src: string;
  mine: boolean;
  timeLabel: string;
  tick?: "none" | "sent" | "delivered" | "read";
  id?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [speedOpen, setSpeedOpen] = useState(false);

  useEffect(() => {
    const a = new Audio(src);
    audioRef.current = a;
    const onMeta = () => setDur(a.duration || 0);
    const onTime = () => setCur(a.currentTime || 0);
    const onEnd = () => {
      setPlaying(false);
      setCur(0);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.pause();
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[speedIdx];
  }, [speedIdx]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const seek = (t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setCur(t);
  };

  return (
    <div id={id} className="flex max-w-[min(78vw,300px)] flex-col items-end gap-0.5 select-none">
      <div
        className={cn(
          "relative flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 shadow-sm",
          mine ? "bg-[#2563eb] text-white" : "border border-slate-200 bg-white text-slate-800",
        )}
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full",
            mine ? "bg-white text-[#2563eb]" : "bg-[#2563eb] text-white",
          )}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <SeekBar value={cur} max={dur || 1} light={mine} onSeek={seek} />
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setSpeedOpen((v) => !v)}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
              mine ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700",
            )}
          >
            {SPEEDS[speedIdx]}x
          </button>
          {speedOpen ? (
            <div className="absolute bottom-full right-0 z-20 mb-1 min-w-[4.5rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {SPEEDS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-800 hover:bg-slate-50",
                    i === speedIdx && "text-[#2563eb]",
                  )}
                  onClick={() => {
                    setSpeedIdx(i);
                    setSpeedOpen(false);
                  }}
                >
                  {s.toFixed(1).replace(/\.0$/, "")}x
                  {i === speedIdx ? <Check className="h-3 w-3" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1 px-1 text-[10px] text-slate-400">
        <span>{fmtDur(playing || cur > 0 ? cur : dur)}</span>
        <span>·</span>
        <span>{timeLabel}</span>
        {tick && tick !== "none" ? (
          tick === "read" ? (
            <CheckCheck className="h-3.5 w-3.5 text-[#0b1b3a]" />
          ) : tick === "sent" ? (
            <Check className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <CheckCheck className="h-3.5 w-3.5 text-slate-400" />
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * Recording UI:
 * - Recording: Cancel | Pause | Send (send stops + uploads immediately)
 * - Paused: Cancel | Play (preview) | Continue | Send
 * No "Ready to send" intermediate — Send always finalizes.
 */
export function VoiceRecorderBar({
  recording,
  paused,
  seconds,
  previewUrl,
  onCancel,
  onPause,
  onContinue,
  onPreviewPlay,
  onSend,
}: {
  recording: boolean;
  paused: boolean;
  seconds: number;
  previewUrl: string | null;
  onCancel: () => void;
  onPause: () => void;
  onContinue: () => void;
  onPreviewPlay: () => void;
  onSend: () => void;
}) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="mb-2 select-none rounded-2xl border border-red-100 bg-gradient-to-b from-red-50 to-white px-3 py-3 shadow-sm">
      <div className="mb-3 flex flex-col items-center gap-1">
        <WaveBars active={recording && !paused} />
        <p className="text-sm font-bold tabular-nums text-slate-700">{mm}:{ss}</p>
        <p className="text-[11px] font-medium text-slate-500">
          {recording && !paused ? "Recording…" : paused ? "Paused — play to preview or continue" : "Voice note"}
        </p>
      </div>
      <div className="flex items-center justify-center gap-5">
        <button type="button" onClick={onCancel} className="flex flex-col items-center gap-1 text-slate-500">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100">
            <X className="h-5 w-5" />
          </span>
          <span className="text-[10px] font-semibold">Cancel</span>
        </button>

        {paused ? (
          <>
            <button type="button" onClick={onPreviewPlay} className="flex flex-col items-center gap-1 text-slate-600">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-800 text-white">
                <Play className="ml-0.5 h-5 w-5" />
              </span>
              <span className="text-[10px] font-semibold">Play</span>
            </button>
            <button type="button" onClick={onContinue} className="flex flex-col items-center gap-1">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-red-500 text-white shadow-md">
                <Mic className="h-6 w-6" />
              </span>
              <span className="text-[10px] font-semibold text-slate-600">Continue</span>
            </button>
          </>
        ) : (
          <button type="button" onClick={onPause} className="flex flex-col items-center gap-1">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-800 text-white shadow-md">
              <Pause className="h-6 w-6" />
            </span>
            <span className="text-[10px] font-semibold text-slate-600">Pause</span>
          </button>
        )}

        <button type="button" onClick={onSend} className="flex flex-col items-center gap-1">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#2563eb] text-white shadow-md">
            <Play className="ml-0.5 h-5 w-5" />
          </span>
          <span className="text-[10px] font-semibold text-[#2563eb]">Send</span>
        </button>
      </div>
    </div>
  );
}

export function parseMediaUrls(url: string | null | undefined): string[] {
  if (!url) return [];
  const s = url.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as unknown;
      if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  if (s.includes("||")) return s.split("||").map((x) => x.trim()).filter(Boolean);
  return [s];
}

export function attachmentLabel(type: string | null | undefined, url?: string | null): string {
  const urls = parseMediaUrls(url);
  const n = Math.max(1, urls.length);
  if (type === "audio") return n > 1 ? `${n} voice notes` : "Voice note";
  if (type === "image" || type === "images") return n > 1 ? `${n} photos` : "Photo";
  if (type === "video" || type === "videos") return n > 1 ? `${n} videos` : "Video";
  if (type === "file") return n > 1 ? `${n} files` : "File";
  return "Attachment";
}

export function ImageBubble({
  src,
  timeLabel,
  tick,
  onOpen,
  id,
  count,
}: {
  src: string;
  mine?: boolean;
  timeLabel: string;
  tick?: "none" | "sent" | "delivered" | "read";
  onOpen: (index?: number) => void;
  id?: string;
  count?: number;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={() => onOpen(0)}
      className="relative block max-w-[min(72vw,280px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <img src={src} alt="" className="max-h-72 w-full object-cover" draggable={false} />
      {(count || 0) > 1 ? (
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
          +{(count || 1) - 1}
        </span>
      ) : null}
      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
        <span>{timeLabel}</span>
        {tick === "read" ? (
          <CheckCheck className="h-3 w-3 text-sky-300" />
        ) : tick === "delivered" || tick === "sent" ? (
          <CheckCheck className="h-3 w-3 text-white/80" />
        ) : null}
      </div>
    </button>
  );
}

export function ImageLightbox({
  urls,
  index = 0,
  onClose,
}: {
  src?: string;
  urls?: string[];
  index?: number;
  onClose: () => void;
}) {
  const list = urls && urls.length ? urls : src ? [src] : [];
  const [i, setI] = useState(index);
  useEffect(() => setI(index), [index]);
  if (!list.length) return null;
  const cur = list[Math.min(i, list.length - 1)];

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-white">
          {list.length > 1 ? `${i + 1} / ${list.length}` : "Photo"}
        </p>
        <span className="w-10" />
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center"
        onTouchStart={(e) => {
          (e.currentTarget as HTMLElement).dataset.tx = String(e.touches[0]?.clientX ?? 0);
        }}
        onTouchEnd={(e) => {
          const start = Number((e.currentTarget as HTMLElement).dataset.tx || 0);
          const end = e.changedTouches[0]?.clientX ?? 0;
          const dx = end - start;
          if (dx > 50) setI((v) => Math.max(0, v - 1));
          if (dx < -50) setI((v) => Math.min(list.length - 1, v + 1));
        }}
      >
        <img src={cur} alt="" className="max-h-full max-w-full object-contain" />
      </div>
      {list.length > 1 ? (
        <div className="flex justify-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {list.map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={cn("h-2 w-2 rounded-full", idx === i ? "bg-white" : "bg-white/40")}
              onClick={() => setI(idx)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LongPressMenu({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: { label: string; icon?: "edit" | "delete" | "download" | "copy"; danger?: boolean; onClick: () => void }[];
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="mb-[max(0.5rem,env(safe-area-inset-bottom))] w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            className={cn(
              "flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left text-sm font-semibold last:border-0",
              it.danger ? "text-red-600" : "text-slate-800",
            )}
            onClick={() => {
              it.onClick();
              onClose();
            }}
          >
            {it.icon === "edit" ? <Pencil className="h-4 w-4" /> : null}
            {it.icon === "delete" ? <Trash2 className="h-4 w-4" /> : null}
            {it.icon === "download" ? <Download className="h-4 w-4" /> : null}
            {it.label}
          </button>
        ))}
        <button type="button" className="w-full px-4 py-3.5 text-sm font-bold text-slate-500" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function lastSeenLabel(atMs: number | null | undefined): string {
  if (!atMs) return "Offline";
  const diff = Date.now() - atMs;
  if (diff < 60_000) return "Last seen just now";
  if (diff < 3600_000) return `Last seen ${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `Last seen ${Math.floor(diff / 3600_000)} hr ago`;
  const days = Math.floor(diff / 86400_000);
  if (days === 1) return "Last seen yesterday";
  return `Last seen ${days} days ago`;
}
