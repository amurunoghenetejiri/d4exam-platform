import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "error" | "info";

export const TONES: Record<
  Tone,
  {
    icon: typeof CheckCircle2;
    text: string;
    bg: string;
    softBg: string;
    border: string;
    bar: string;
    ring: string;
    label: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-600",
    softBg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    bar: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    label: "Success",
  },
  warning: {
    icon: AlertTriangle,
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500",
    softBg: "bg-amber-500/10",
    border: "border-amber-500/40",
    bar: "bg-amber-500",
    ring: "ring-amber-500/30",
    label: "Warning",
  },
  error: {
    icon: XCircle,
    text: "text-destructive",
    bg: "bg-destructive",
    softBg: "bg-destructive/10",
    border: "border-destructive/40",
    bar: "bg-destructive",
    ring: "ring-destructive/30",
    label: "Error",
  },
  info: {
    icon: Info,
    text: "text-primary",
    bg: "bg-primary",
    softBg: "bg-primary/10",
    border: "border-primary/40",
    bar: "bg-primary",
    ring: "ring-primary/30",
    label: "Info",
  },
};

export type DemoMessage = { tone: Tone; title: string; message: string };

export const SAMPLE_MESSAGES: DemoMessage[] = [
  { tone: "success", title: "Result published", message: "CSC 201 results are now visible to 128 students." },
  { tone: "warning", title: "Exam starts in 10 minutes", message: "Complete your camera check before the session opens." },
  { tone: "error", title: "Submission failed", message: "Your answers could not be saved. Check your connection." },
  { tone: "info", title: "New academic session", message: "2025/2026 first semester has been activated by the admin." },
];

/** Wrapper providing swipe-to-dismiss (touch + mouse drag) for any demo toast. */
export function Swipeable({
  onDismiss,
  children,
  className,
}: {
  onDismiss: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const move = (x: number) => {
      if (start.current === null) return;
      setDx(x - start.current);
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX);
    const onTouchMove = (e: TouchEvent) => move(e.touches[0]!.clientX);
    const end = () => {
      setDragging(false);
      start.current = null;
      setDx((cur) => {
        if (Math.abs(cur) > 90) {
          onDismiss();
          return 0;
        }
        return 0;
      });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", end);
    };
  }, [dragging, onDismiss]);

  return (
    <div
      className={cn("touch-pan-y select-none", className)}
      style={{
        transform: `translateX(${dx}px)`,
        opacity: 1 - Math.min(Math.abs(dx) / 220, 0.7),
        transition: dragging ? "none" : "transform .18s ease, opacity .18s ease",
        cursor: dragging ? "grabbing" : "grab",
      }}
      onMouseDown={(e) => {
        start.current = e.clientX;
        setDragging(true);
      }}
      onTouchStart={(e) => {
        start.current = e.touches[0]!.clientX;
        setDragging(true);
      }}
    >
      {children}
    </div>
  );
}

function CloseBtn({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label="Dismiss notification"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={cn(
        "pressable shrink-0 rounded-md p-1 opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

type ToastProps = { data: DemoMessage; onDismiss: () => void };

/** 20 distinct visual treatments. */
export const STYLES: { id: number; name: string; render: (p: ToastProps) => ReactNode }[] = [
  {
    id: 1,
    name: "Compact pill",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 shadow-sm">
          <t.icon className={cn("h-4 w-4 shrink-0", t.text)} />
          <span className="truncate text-xs font-medium">{data.title}</span>
          <CloseBtn onClick={onDismiss} className="ml-auto" />
        </div>
      );
    },
  },
  {
    id: 2,
    name: "Left accent bar",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="flex overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className={cn("w-1.5 shrink-0", t.bar)} />
          <div className="flex flex-1 items-start gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{data.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{data.message}</p>
            </div>
            <CloseBtn onClick={onDismiss} />
          </div>
        </div>
      );
    },
  },
  {
    id: 3,
    name: "Icon in circle",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", t.softBg)}>
            <t.icon className={cn("h-4.5 w-4.5", t.text)} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{data.title}</p>
            <p className="truncate text-xs text-muted-foreground">{data.message}</p>
          </div>
          <CloseBtn onClick={onDismiss} />
        </div>
      );
    },
  },
  {
    id: 4,
    name: "Stacked card",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="relative">
          <div className="absolute inset-x-3 -bottom-1.5 h-4 rounded-b-xl border border-t-0 bg-muted/60" />
          <div className="relative rounded-xl border bg-card p-3.5 shadow-md">
            <div className="flex items-start gap-2">
              <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.text)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{data.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.message}</p>
              </div>
              <CloseBtn onClick={onDismiss} />
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: 5,
    name: "Progress timer",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="flex items-start gap-2 p-3">
            <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.text)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{data.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{data.message}</p>
            </div>
            <CloseBtn onClick={onDismiss} />
          </div>
          <div className="h-1 w-full bg-muted">
            <div className={cn("h-full w-2/3", t.bar)} />
          </div>
        </div>
      );
    },
  },
  {
    id: 6,
    name: "Bordered tone card",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className={cn("rounded-lg border-2 bg-card p-3 shadow-sm", t.border)}>
          <div className="flex items-start gap-2">
            <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.text)} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", t.text)}>{data.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{data.message}</p>
            </div>
            <CloseBtn onClick={onDismiss} />
          </div>
        </div>
      );
    },
  },
  {
    id: 7,
    name: "Floating glass",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="surface-panel flex items-start gap-3 p-3">
          <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.text)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{data.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.message}</p>
          </div>
          <CloseBtn onClick={onDismiss} />
        </div>
      );
    },
  },
  {
    id: 8,
    name: "Top banner",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className={cn("flex items-center gap-2 rounded-b-lg px-4 py-2.5 text-primary-foreground shadow-sm", t.bg)}>
          <t.icon className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 truncate text-xs font-medium">
            <span className="font-semibold">{data.title}.</span> {data.message}
          </p>
          <CloseBtn onClick={onDismiss} className="opacity-80" />
        </div>
      );
    },
  },
  {
    id: 9,
    name: "Bottom snackbar",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="flex items-center gap-3 rounded-lg bg-foreground px-3.5 py-3 text-background shadow-lg">
          <t.icon className="h-4 w-4 shrink-0 opacity-90" />
          <p className="min-w-0 flex-1 truncate text-xs">{data.message}</p>
          <button
            type="button"
            onClick={onDismiss}
            onMouseDown={(e) => e.stopPropagation()}
            className="pressable text-xs font-semibold uppercase tracking-wide opacity-90"
          >
            Undo
          </button>
          <CloseBtn onClick={onDismiss} className="opacity-80" />
        </div>
      );
    },
  },
  {
    id: 10,
    name: "Title / message hierarchy",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <t.icon className={cn("h-4 w-4", t.text)} />
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {t.label}
              </p>
            </div>
            <CloseBtn onClick={onDismiss} />
          </div>
          <p className="mt-2 text-sm font-semibold">{data.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.message}</p>
        </div>
      );
    },
  },
  {
    id: 11,
    name: "Badge style",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="flex items-center gap-2.5 rounded-lg border bg-card p-3 shadow-sm">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide",
              t.softBg,
              t.text,
            )}
          >
            {t.label}
          </span>
          <p className="min-w-0 flex-1 truncate text-xs font-medium">{data.title}</p>
          <CloseBtn onClick={onDismiss} />
        </div>
      );
    },
  },
  {
    id: 12,
    name: "Outlined minimal",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className={cn("flex items-start gap-2 rounded-md border bg-transparent p-3", t.border)}>
          <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.text)} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{data.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.message}</p>
          </div>
          <CloseBtn onClick={onDismiss} />
        </div>
      );
    },
  },
  {
    id: 13,
    name: "Soft filled",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className={cn("flex items-start gap-3 rounded-xl p-3.5", t.softBg)}>
          <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.text)} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-semibold", t.text)}>{data.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data.message}</p>
          </div>
          <CloseBtn onClick={onDismiss} />
        </div>
      );
    },
  },
  {
    id: 14,
    name: "Solid filled",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className={cn("flex items-start gap-3 rounded-lg p-3.5 text-primary-foreground shadow-md", t.bg)}>
          <t.icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{data.title}</p>
            <p className="mt-0.5 text-xs opacity-90">{data.message}</p>
          </div>
          <CloseBtn onClick={onDismiss} className="opacity-90" />
        </div>
      );
    },
  },
  {
    id: 15,
    name: "Split panel",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="flex overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className={cn("flex w-12 shrink-0 items-center justify-center text-primary-foreground", t.bg)}>
            <t.icon className="h-5 w-5" />
          </div>
          <div className="flex min-w-0 flex-1 items-start gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{data.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{data.message}</p>
            </div>
            <CloseBtn onClick={onDismiss} />
          </div>
        </div>
      );
    },
  },
  {
    id: 16,
    name: "Action footer",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-start gap-2 p-3.5">
            <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.text)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{data.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{data.message}</p>
            </div>
            <CloseBtn onClick={onDismiss} />
          </div>
          <div className="flex justify-end gap-2 border-t px-3.5 py-2">
            <button type="button" onClick={onDismiss} className="pressable text-xs text-muted-foreground">
              Dismiss
            </button>
            <button type="button" className={cn("pressable text-xs font-semibold", t.text)}>
              View details
            </button>
          </div>
        </div>
      );
    },
  },
  {
    id: 17,
    name: "Avatar / source",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="flex items-start gap-3 rounded-lg border bg-card p-3 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold">
            D4
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold">D4EXAM</p>
              <span className={cn("h-1.5 w-1.5 rounded-full", t.bar)} />
              <span className="text-[0.65rem] text-muted-foreground">now</span>
            </div>
            <p className="mt-1 text-xs font-medium">{data.title}</p>
            <p className="text-xs text-muted-foreground">{data.message}</p>
          </div>
          <CloseBtn onClick={onDismiss} />
        </div>
      );
    },
  },
  {
    id: 18,
    name: "Ring highlight",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm ring-4", t.ring)}>
          <t.icon className={cn("h-5 w-5 shrink-0", t.text)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{data.title}</p>
            <p className="truncate text-xs text-muted-foreground">{data.message}</p>
          </div>
          <CloseBtn onClick={onDismiss} />
        </div>
      );
    },
  },
  {
    id: 19,
    name: "Bell / inbox row",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="flex items-start gap-3 border-l-2 bg-muted/40 p-3 pl-3.5" style={undefined}>
          <span className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-md", t.softBg)}>
            <Bell className={cn("h-3.5 w-3.5", t.text)} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className="mt-0.5 text-sm font-medium">{data.title}</p>
            <p className="text-xs text-muted-foreground">{data.message}</p>
          </div>
          <CloseBtn onClick={onDismiss} />
        </div>
      );
    },
  },
  {
    id: 20,
    name: "Underline accent",
    render: ({ data, onDismiss }) => {
      const t = TONES[data.tone];
      return (
        <div className="overflow-hidden rounded-lg bg-card shadow-md">
          <div className="flex items-start gap-2 p-3.5">
            <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.text)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight">{data.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{data.message}</p>
            </div>
            <CloseBtn onClick={onDismiss} />
          </div>
          <div className={cn("h-[3px] w-full", t.bar)} />
        </div>
      );
    },
  },
];
