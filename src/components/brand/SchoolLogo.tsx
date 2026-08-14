import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * Displays a school logo from the database URL, or D4EXAM fallback.
 * Never shows a broken image icon.
 */
export function SchoolLogo({
  logoUrl,
  schoolName,
  className,
  size = "md",
  rounded = true,
}: {
  logoUrl?: string | null;
  schoolName?: string | null;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  rounded?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const dims = {
    xs: "h-6 w-6",
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-14 w-14",
    xl: "h-20 w-20",
  }[size];

  const showFallback = !logoUrl || failed;

  if (showFallback) {
    return (
      <img
        src="/logo.png"
        alt={schoolName ? `${schoolName} (D4EXAM)` : "D4EXAM"}
        className={cn(dims, "shrink-0 object-contain", rounded && "rounded-lg", className)}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <img
      src={logoUrl}
      alt={schoolName ? `${schoolName} logo` : "School logo"}
      className={cn(
        dims,
        "shrink-0 bg-white object-contain",
        rounded && "rounded-lg",
        className,
      )}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** Side-by-side school logo + D4EXAM mark for exam headers / portals. */
export function DualBrand({
  logoUrl,
  schoolName,
  className,
}: {
  logoUrl?: string | null;
  schoolName?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <SchoolLogo logoUrl={logoUrl} schoolName={schoolName} size="md" />
      <span className="hidden h-6 w-px bg-white/20 sm:block" aria-hidden />
      <img
        src="/logo.png"
        alt="D4EXAM"
        className="hidden h-8 w-auto object-contain sm:block"
        loading="eager"
      />
      {schoolName && (
        <span className="hidden max-w-[160px] truncate text-xs font-bold text-white/90 lg:inline">
          {schoolName}
        </span>
      )}
    </span>
  );
}
