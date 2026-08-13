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
  // Larger mark so the logo is always readable and stands out in headers/sidebars
  const dims = { sm: "h-12", md: "h-14", lg: "h-16", xl: "h-20" }[size];
  const text = { sm: "text-xl", md: "text-2xl", lg: "text-3xl", xl: "text-4xl" }[size];

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <img
        src="/logo.png"
        alt="D4EXAM"
        className={cn(dims, "w-auto shrink-0 object-contain drop-shadow-sm")}
        width={80}
        height={80}
        loading="eager"
        decoding="async"
      />
      {wordmark && (
        <span className="min-w-0 leading-none">
          <span
            className={cn(
              "block font-display font-extrabold tracking-tight text-primary",
              text,
            )}
          >
            D4EXAM
          </span>
          {showTagline && (
            <span className="mt-1 block text-xs font-medium text-muted-foreground">
              Smart. Secure. Seamless.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
