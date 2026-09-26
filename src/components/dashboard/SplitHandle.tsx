import type { PointerEvent as PE } from "react";
import { cn } from "@/lib/utils";

/** Short centered blue drag handle with a soft white shimmer (not full panel height). */
export function SplitHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  className,
}: {
  onPointerDown: (e: PE<HTMLDivElement>) => void;
  onPointerMove: (e: PE<HTMLDivElement>) => void;
  onPointerUp: (e: PE<HTMLDivElement>) => void;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize panels"
      className={cn(
        "relative z-20 flex w-5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center",
        className,
      )}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative h-28 w-[3px] overflow-hidden rounded-full bg-blue-500 shadow-sm shadow-blue-500/40 sm:h-32">
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 w-full bg-gradient-to-b from-white/70 via-white/25 to-transparent"
          style={{ animation: "d4-split-shimmer 1.6s ease-in-out infinite" }}
        />
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50"
          style={{ animation: "d4-split-zig 1.2s linear infinite" }}
        />
      </div>
      <style>{`
        @keyframes d4-split-shimmer {
          0% { transform: translateY(-100%); opacity: 0.3; }
          50% { opacity: 0.9; }
          100% { transform: translateY(200%); opacity: 0.3; }
        }
        @keyframes d4-split-zig {
          0% { transform: translate(-50%, -120%); opacity: 0.2; }
          50% { opacity: 0.85; }
          100% { transform: translate(-50%, 120%); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
