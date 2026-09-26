import { useEffect, useRef, useState, useCallback } from "react";
import { Check, CheckCheck, Download, Mic, Pause, Play, Pencil, Trash2, X, Send, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function fmtDur(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type VoiceReg = { id: string; play: () => void; pause: () => void };
const voiceOrder: string[] = [];
const voiceMap = new Map<string, VoiceReg>();
let activeVoiceId: string | null = null;

function registerVoice(id: string, reg: VoiceReg) {
  if (!voiceMap.has(id)) voiceOrder.push(id);
  voiceMap.set(id, reg);
}
function unregisterVoice(id: string) {
  voiceMap.delete(id);
  const i = voiceOrder.indexOf(id);
  if (i >= 0) voiceOrder.splice(i, 1);
  if (activeVoiceId === id) activeVoiceId = null;
}
function playVoice(id: string) {
  if (activeVoiceId && activeVoiceId !== id) {
    voiceMap.get(activeVoiceId)?.pause();
  }
  activeVoiceId = id;
  voiceMap.get(id)?.play();
}
function onVoiceEnded(id: string) {
  if (activeVoiceId !== id) return;
  activeVoiceId = null;
  const i = voiceOrder.indexOf(id);
  if (i >= 0 && i < voiceOrder.length - 1) {
    const next = voiceOrder[i + 1];
    window.setTimeout(() => playVoice(next), 280);
  }
}

function WaveBars({
  active,
  light,
  progress = 0,
  onSeek,
}: {
  active?: boolean;
  light?: boolean;
  progress?: number;
  onSeek?: (ratio: number) => void;
}) {
  const heights = [6, 10, 14, 18, 12, 8, 16, 20, 14, 9, 13, 19, 11, 7, 15, 17, 12, 8, 14, 18, 10, 6, 12, 16, 11, 8, 13, 9];
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = Math.max(0, Math.min(1, progress));
  const filledCount = Math.round(pct * heights.length);

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !onSeek) return;
    const rect = el.getBoundingClientRect();
    const pad = 6;
    const usable = Math.max(1, rect.width - pad * 2);
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - pad) / usable));
    onSeek(ratio);
  };

  return (
    <div
      ref={trackRef}
      className={cn("relative flex h-7 w-full items-center gap-[2.5px] overflow-visible px-1.5", onSeek && "cursor-pointer touch-none")}
      onPointerDown={(e) => {
        if (!onSeek) return;
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        seekFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!onSeek || e.buttons !== 1) return;
        e.stopPropagation();
        seekFromClientX(e.clientX);
      }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {heights.map((h, i) => {
        const passed = i < filledCount;
        return (
          <span
            key={i}
            className={cn(
              "w-[2.5px] shrink-0 rounded-full transition-colors duration-75",
              light ? (passed ? "bg-white" : "bg-white/35") : (passed ? "bg-[#2563eb]" : "bg-[#93c5fd]/70"),
              active && !passed && "animate-pulse",
            )}
            style={{
              height: active && !passed ? h + (i % 3) : h,
              animationDelay: `${i * 28}ms`,
              animationDuration: "0.9s",
            }}
          />
        );
      })}
      {onSeek ? (
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow transition-[left] duration-75",
            light ? "bg-white" : "bg-[#2563eb]",
          )}
          style={{ left: `${6 + pct * 88}%` }}
        />
      ) : null}
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
  tick?: "none" | "sent" | "delivered" | "read" | "pending";
  id?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [speedOpen, setSpeedOpen] = useState(false);
  const voiceId = id || src;

  useEffect(() => {
    const a = new Audio(src);
    audioRef.current = a;
    const onMeta = () => setDur(a.duration || 0);
    const onTime = () => setCur(a.currentTime || 0);
    const onEnd = () => {
      setPlaying(false);
      setCur(0);
      try { a.currentTime = 0; } catch { /* ignore */ }
      onVoiceEnded(voiceId);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);

    registerVoice(voiceId, {
      id: voiceId,
      play: () => {
        void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      },
      pause: () => {
        a.pause();
        setPlaying(false);
      },
    });

    return () => {
      a.pause();
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      unregisterVoice(voiceId);
    };
  }, [src, voiceId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[speedIdx];
  }, [speedIdx]);

  const toggle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      if (activeVoiceId === voiceId) activeVoiceId = null;
    } else {
      playVoice(voiceId);
    }
  };

  const own = mine;
  const timeShown = playing ? fmtDur(cur) : fmtDur(dur > 0 ? dur : 0);

  return (
    <div
      id={id}
      className={cn(
        "flex w-[min(78vw,280px)] min-w-[220px] flex-col gap-0.5 select-none",
        own ? "items-end" : "items-start",
      )}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "relative flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 shadow-sm",
          own ? "border border-slate-200 bg-white text-slate-800" : "bg-[#2563eb] text-white",
        )}
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-sm",
            own ? "bg-[#2563eb] text-white" : "bg-white text-[#2563eb]",
          )}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1 py-0.5">
          <WaveBars
            active={playing}
            light={!own}
            progress={dur > 0 ? cur / dur : 0}
            onSeek={(ratio) => {
              const a = audioRef.current;
              if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return;
              const t = ratio * a.duration;
              a.currentTime = t;
              setCur(t);
            }}
          />
          <div className={cn("mt-1 flex items-center gap-1 text-[10px] font-medium tabular-nums", own ? "text-slate-400" : "text-white/80")}>
            <span>{timeShown}</span>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSpeedOpen((v) => !v);
            }}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
              own ? "bg-slate-100 text-slate-700" : "bg-white/20 text-white",
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
                  onClick={(e) => {
                    e.stopPropagation();
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
      <div className={cn("flex items-center gap-1 px-1 text-[10px]", own ? "text-slate-400" : "text-slate-400")}>
        <span>{timeLabel}</span>
        {tick && tick !== "none" ? (
          tick === "pending" ? (
            <Clock className="h-3.5 w-3.5 text-slate-400" />
          ) : tick === "read" ? (
            <CheckCheck className="h-3.5 w-3.5 text-[#2563eb]" />
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
    <div className="mb-0 select-none rounded-xl border border-blue-200/80 bg-gradient-to-b from-[#eff6ff] to-white px-2.5 py-2 shadow-sm">
      <div className="mb-2 flex flex-col items-center gap-0.5">
        <WaveBars active={recording && !paused} />
        <p className="text-sm font-bold tabular-nums text-slate-800">{mm}:{ss}</p>
        <p className="text-[10px] font-medium text-slate-500">
          {recording && !paused ? "Recording…" : paused ? "Paused" : "Voice note"}
        </p>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button type="button" onClick={onCancel} className="flex flex-col items-center gap-0.5 text-slate-500">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100">
            <X className="h-4 w-4" />
          </span>
          <span className="text-[9px] font-semibold">Cancel</span>
        </button>
        {paused ? (
          <>
            <button type="button" onClick={onPreviewPlay} className="flex flex-col items-center gap-0.5 text-slate-600">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-white">
                <Play className="ml-0.5 h-4 w-4" />
              </span>
              <span className="text-[9px] font-semibold">Play</span>
            </button>
            <button type="button" onClick={onContinue} className="flex flex-col items-center gap-0.5">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#2563eb] text-white shadow-md">
                <Mic className="h-5 w-5" />
              </span>
              <span className="text-[9px] font-semibold text-slate-600">Continue</span>
            </button>
          </>
        ) : (
          <button type="button" onClick={onPause} className="flex flex-col items-center gap-0.5">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-800 text-white shadow-md">
              <Pause className="h-5 w-5" />
            </span>
            <span className="text-[9px] font-semibold text-slate-600">Pause</span>
          </button>
        )}
        <button type="button" onClick={onSend} className="flex flex-col items-center gap-0.5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#2563eb] text-white shadow-lg ring-2 ring-blue-200">
            <Send className="h-5 w-5" />
          </span>
          <span className="text-[9px] font-bold text-[#2563eb]">Send</span>
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
    } catch { /* fall through */ }
  }
  if (s.includes("||")) return s.split("||").map((x) => x.trim()).filter(Boolean);
  return [s];
}

export function encodeOfficerMedia(text: string, type: string, url: string): string {
  const body = (text || "").trim();
  const marker = `__media__|${type}|${url}`;
  return body ? `${body}\n${marker}` : marker;
}

export function parseOfficerReply(raw: string | null | undefined): {
  text: string;
  mediaType?: string;
  mediaUrl?: string;
} {
  const s = (raw || "").trim();
  if (!s) return { text: "" };
  const m = s.match(/(?:^|\n)__media__\|([^|]+)\|(.+)$/);
  if (m) {
    const text = s.replace(/(?:^|\n)__media__\|[^|]+\|.+$/, "").trim();
    return { text: text === "(attachment)" ? "" : text, mediaType: m[1], mediaUrl: m[2] };
  }
  return { text: s === "(attachment)" ? "" : s };
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
  tick?: "none" | "sent" | "delivered" | "read" | "pending";
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
        {tick === "pending" ? (
          <Clock className="h-3 w-3 text-white/90" />
        ) : tick === "read" ? (
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
  const [scale, setScale] = useState(1);
  const touchRef = useRef<{ x: number; y: number; dist?: number } | null>(null);

  useEffect(() => setI(index), [index]);
  useEffect(() => setScale(1), [i]);

  if (!list.length) return null;
  const cur = list[Math.min(i, list.length - 1)];

  const go = (dir: -1 | 1) => {
    setI((prev) => {
      const next = prev + dir;
      if (next < 0) return list.length - 1;
      if (next >= list.length) return 0;
      return next;
    });
    setScale(1);
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="rounded-full bg-black/40 px-3 py-1 text-sm font-semibold text-white backdrop-blur-sm">
          {list.length > 1 ? `${i + 1} / ${list.length}` : "Photo"}
        </p>
        <span className="w-10" />
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden touch-none"
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchRef.current = { x: 0, y: 0, dist: Math.hypot(dx, dy) };
            return;
          }
          touchRef.current = { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 };
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && touchRef.current?.dist) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const ratio = dist / touchRef.current.dist;
            setScale((s) => Math.max(1, Math.min(4, s * ratio)));
            touchRef.current.dist = dist;
          }
        }}
        onTouchEnd={(e) => {
          const s = touchRef.current;
          touchRef.current = null;
          if (!s || list.length < 2 || scale > 1.05) return;
          if (s.dist) return;
          const x = e.changedTouches[0]?.clientX ?? 0;
          const dx = x - s.x;
          if (dx < -56) go(1);
          else if (dx > 56) go(-1);
        }}
        onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2))}
      >
        <img
          src={cur}
          alt=""
          className="select-none transition-transform duration-150"
          style={{
            width: "100%",
            height: "100%",
            maxWidth: "100vw",
            maxHeight: "100dvh",
            objectFit: "contain",
            transform: `scale(${scale})`,
          }}
          draggable={false}
        />
      </div>
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
            className={cn("flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left text-sm font-semibold last:border-0", it.danger ? "text-red-600" : "text-slate-800")}
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
        <button type="button" className="w-full px-4 py-3.5 text-sm font-bold text-slate-500" onClick={onClose}>Cancel</button>
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

export function MessageTicks({ state }: { state: "none" | "pending" | "sent" | "delivered" | "read" }) {
  if (state === "none") return null;
  if (state === "pending") return <Clock className="inline h-3.5 w-3.5 text-slate-400" aria-label="Pending" />;
  if (state === "sent") return <Check className="inline h-3.5 w-3.5 text-slate-400" aria-label="Sent" />;
  if (state === "delivered") return <CheckCheck className="inline h-3.5 w-3.5 text-slate-400" aria-label="Delivered" />;
  return <CheckCheck className="inline h-3.5 w-3.5 text-[#2563eb]" aria-label="Read" />;
}
