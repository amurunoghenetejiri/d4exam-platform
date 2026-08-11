import logo from "@/assets/d4exam-logo.png.asset.json";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  size = "md",
  showTagline = false,
  wordmark = true,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  wordmark?: boolean;
}) {
  const dims = { sm: "h-7", md: "h-9", lg: "h-12" }[size];
  const text = { sm: "text-base", md: "text-lg", lg: "text-2xl" }[size];

  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <img
        src={logo.url}
        alt="D4EXAM logo"
        className={cn(dims, "w-auto shrink-0 object-contain")}
        width={48}
        height={64}
      />
      {wordmark && (
        <span className="min-w-0 leading-none">
          <span className={cn("block font-display font-extrabold tracking-tight", text)}>
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
