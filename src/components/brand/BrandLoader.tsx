import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useSchoolIdentity } from "@/lib/school-identity";
import { useSessionUser } from "@/lib/session";

const D4_LOGO = "/logo.png";

type BrandLoaderProps = {
  /** Override school id; otherwise uses session school when available. */
  schoolId?: string | null;
  /** Force D4EXAM branding (public / super-admin global). */
  forcePlatform?: boolean;
  /** Optional caption under the logo. */
  label?: string;
  /** full = page center; compact = inline block */
  variant?: "full" | "compact";
  className?: string;
};

/**
 * Premium identity-aware loader.
 * - No school context → D4EXAM logo + light sweep
 * - School known → school logo + name (fallback to D4EXAM if logo missing)
 * CSS-only animation; respects prefers-reduced-motion.
 */
export function BrandLoader({
  schoolId,
  forcePlatform = false,
  label,
  variant = "full",
  className,
}: BrandLoaderProps) {
  const { data: session } = useSessionUser();
  const resolvedSchoolId = forcePlatform ? null : schoolId ?? session?.schoolId ?? null;
  const schoolQ = useSchoolIdentity(resolvedSchoolId);
  const school = schoolQ.data;

  const [logoFailed, setLogoFailed] = useState(false);
  const schoolLogo = school?.logoUrl && !logoFailed ? school.logoUrl : null;
  const useSchool = Boolean(resolvedSchoolId && school && !forcePlatform);
  const imgSrc = useSchool && schoolLogo ? schoolLogo : D4_LOGO;
  const title = useSchool && school?.name ? school.name : "D4EXAM";
  const caption =
    label ??
    (useSchool && school?.name
      ? `Loading ${school.name}…`
      : "Preparing your examination environment…");

  useEffect(() => {
    setLogoFailed(false);
  }, [schoolLogo]);

  const isFull = variant === "full";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        isFull && "min-h-[40vh] py-12",
        className,
      )}
    >
      <div className={cn("brand-loader-stage", isFull ? "h-28 w-28 sm:h-32 sm:w-32" : "h-16 w-16")}>
        <div className="brand-loader-glow" aria-hidden />
        <div className="brand-loader-ring" aria-hidden />
        <div className="brand-loader-logo-wrap">
          <img
            src={imgSrc}
            alt={title}
            className="brand-loader-logo"
            width={128}
            height={128}
            loading="eager"
            decoding="async"
            onError={() => setLogoFailed(true)}
          />
          <span className="brand-loader-sweep" aria-hidden />
        </div>
      </div>

      {useSchool && school?.name ? (
        <p className="max-w-[min(90vw,20rem)] truncate text-center text-sm font-bold tracking-tight text-slate-800 sm:text-base">
          {school.name}
        </p>
      ) : (
        <p className="text-center text-sm font-extrabold tracking-tight text-primary sm:text-base">
          D4EXAM
        </p>
      )}

      <p className="max-w-[min(90vw,18rem)] text-center text-xs text-slate-500 sm:text-sm">
        {caption}
      </p>

      <span className="sr-only">Loading</span>

      <style>{`
        .brand-loader-stage {
          position: relative;
          display: grid;
          place-items: center;
        }
        .brand-loader-glow {
          position: absolute;
          inset: -12%;
          border-radius: 50%;
          background: radial-gradient(circle, hsl(var(--primary) / 0.22) 0%, transparent 70%);
          animation: brand-glow 2.4s ease-in-out infinite;
          pointer-events: none;
        }
        .brand-loader-ring {
          position: absolute;
          inset: -6%;
          border-radius: 50%;
          border: 1px solid hsl(var(--primary) / 0.18);
          box-shadow: 0 0 0 1px hsl(var(--primary) / 0.06) inset;
          animation: brand-ring 2.8s ease-in-out infinite;
          pointer-events: none;
        }
        .brand-loader-logo-wrap {
          position: relative;
          width: 72%;
          height: 72%;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 18%;
        }
        .brand-loader-logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: transparent;
          filter: brightness(0.92);
          animation: brand-logo-pulse 2.4s ease-in-out infinite;
        }
        .brand-loader-sweep {
          position: absolute;
          top: -20%;
          bottom: -20%;
          width: 28%;
          left: -40%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.08) 35%,
            rgba(255, 255, 255, 0.55) 50%,
            rgba(255, 255, 255, 0.08) 65%,
            transparent 100%
          );
          transform: skewX(-18deg);
          animation: brand-sweep 2.2s ease-in-out infinite;
          pointer-events: none;
          mix-blend-mode: soft-light;
        }
        @keyframes brand-sweep {
          0% { left: -45%; opacity: 0; }
          12% { opacity: 1; }
          55% { left: 115%; opacity: 1; }
          70%, 100% { left: 115%; opacity: 0; }
        }
        @keyframes brand-glow {
          0%, 100% { opacity: 0.45; transform: scale(0.96); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes brand-ring {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.03); }
        }
        @keyframes brand-logo-pulse {
          0%, 100% { filter: brightness(0.9); transform: scale(0.98); }
          50% { filter: brightness(1.08); transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .brand-loader-glow,
          .brand-loader-ring,
          .brand-loader-logo,
          .brand-loader-sweep {
            animation: none !important;
          }
          .brand-loader-logo { filter: none; }
          .brand-loader-sweep { display: none; }
          .brand-loader-glow { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

/** Full-screen overlay loader (auth callbacks, cold start). */
export function BrandLoaderScreen({
  schoolId,
  forcePlatform,
  label,
  className,
}: Omit<BrandLoaderProps, "variant">) {
  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center bg-background px-4",
        className,
      )}
    >
      <BrandLoader
        schoolId={schoolId}
        forcePlatform={forcePlatform}
        label={label}
        variant="full"
      />
    </div>
  );
}
