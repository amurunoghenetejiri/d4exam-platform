import logo from "@/assets/d4exam-logo.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * Subtle brand watermark using the official D4EXAM logo.
 * Low opacity, soft grayscale — sits behind content without competing.
 */
export function Watermark({
  className,
  opacity = 0.045,
  size = "lg",
}: {
  className?: string;
  /** 0–1 opacity. Keep very low (0.03–0.07) so it never overpowers content. */
  opacity?: number;
  size?: "md" | "lg" | "xl";
}) {
  const sizeClass =
    size === "xl"
      ? "h-[min(78vh,640px)] max-w-[92%]"
      : size === "md"
        ? "h-[min(50vh,380px)] max-w-[70%]"
        : "h-[min(68vh,520px)] max-w-[85%]";

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden",
        className,
      )}
    >
      <img
        src={logo.url}
        alt=""
        className={cn("w-auto select-none object-contain", sizeClass)}
        style={{
          opacity,
          filter: "grayscale(1) brightness(0.55) contrast(0.9)",
        }}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
