import { LOGO_SRC } from "@/components/brand/brand-assets";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  size = "md",
  showTagline = false,
  wordmark = true,
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  wordmark?: boolean;
}) {
  const dims = { sm: "h-9", md: "h-11", lg: "h-14", xl: "h-16" }[size];
  const text = { sm: "text-lg", md: "text-xl", lg: "text-2xl", xl: "text-3xl" }[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src={LOGO_SRC}
        alt="D4EXAM"
        className={cn(dims, "w-auto shrink-0 object-contain drop-shadow-sm")}
        width={64}
        height={64}
        loading="eager"
        decoding="async"
      />
      {wordmark && (
        <span className="min-w-0 leading-none">
          <span className={cn("block font-display font-extrabold tracking-tight text-primary", text)}>
            D4EXAM
          </span>
          {showTagline && (
            <span className="mt-1 block text-[11px] font-medium text-muted-foreground">
              Smart. Secure. Seamless.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
