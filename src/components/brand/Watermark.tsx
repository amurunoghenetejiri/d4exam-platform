import logo from "@/assets/d4exam-logo.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * Brand watermark — FIXED to the viewport so page content scrolls over it.
 * Soft grayscale; never blocks interaction.
 */
export function Watermark({
  className,
  opacity = 0.09,
  size = "lg",
}: {
  className?: string;
  /** 0–1 opacity. Default is visible but soft on light backgrounds. */
  opacity?: number;
  size?: "md" | "lg" | "xl";
}) {
  const sizeClass =
    size === "xl"
      ? "h-[min(80vh,680px)] max-w-[94%]"
      : size === "md"
        ? "h-[min(52vh,400px)] max-w-[72%]"
        : "h-[min(70vh,560px)] max-w-[88%]";

  return (
    <div
      aria-hidden
      className={cn(
        // fixed = stays in place while the document scrolls
        "pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden",
        className,
      )}
    >
      <img
        src={logo.url}
        alt=""
        className={cn("w-auto select-none object-contain", sizeClass)}
        style={{
          opacity,
          filter: "grayscale(1) brightness(0.9) contrast(0.85)",
        }}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}
