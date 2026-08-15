import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * Displays a school logo from the database URL, or D4EXAM fallback.
 * Transparent background is preserved (no white fill behind the image).
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
        className={cn(dims, "shrink-0 object-contain bg-transparent", rounded && "rounded-lg", className)}
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
        "shrink-0 bg-transparent object-contain",
        rounded && "rounded-lg",
        className,
      )}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * School identity first (logo + name), optional small D4EXAM mark.
 * Use on school portal headers, dashboards, exam screens.
 */
export function DualBrand({
  logoUrl,
  schoolName,
  className,
  showPlatform = true,
  size = "md",
}: {
  logoUrl?: string | null;
  schoolName?: string | null;
  className?: string;
  showPlatform?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <SchoolLogo logoUrl={logoUrl} schoolName={schoolName} size={size} className="bg-transparent" />
      {schoolName && (
        <span className="hidden min-w-0 truncate text-xs font-bold text-inherit sm:inline sm:max-w-[140px] md:max-w-[200px] lg:max-w-[240px]">
          {schoolName}
        </span>
      )}
      {showPlatform && (
        <>
          <span className="hidden h-6 w-px shrink-0 bg-current opacity-20 sm:block" aria-hidden />
          <img
            src="/logo.png"
            alt="D4EXAM"
            className="hidden h-6 w-auto shrink-0 object-contain bg-transparent opacity-90 sm:block"
            loading="eager"
          />
        </>
      )}
    </span>
  );
}
