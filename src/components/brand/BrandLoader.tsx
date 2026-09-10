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
 * Premium identity-aware loader — wave line + traveling beam (no spinner).
 * Fits app primary theme colors.
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
        "flex flex-col items-center justify-center gap-5",
        isFull && "min-h-[40vh] py-12",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-2xl bg-primary/5",
          isFull ? "h-24 w-24 sm:h-28 sm:w-28" : "h-14 w-14",
        )}
      >
        <img
          src={imgSrc}
          alt={title}
          className={cn(
            "object-contain p-3",
            isFull ? "h-20 w-20 sm:h-24 sm:w-24" : "h-12 w-12",
          )}
          width={96}
          height={96}
          loading="eager"
          decoding="async"
          onError={() => setLogoFailed(true)}
        />
      </div>

      {useSchool && school?.name ? (
        <p className="text-center text-sm font-extrabold tracking-tight text-primary sm:text-base">
          {school.name}
        </p>
      ) : (
        <p className="text-center text-sm font-extrabold tracking-tight text-primary sm:text-base">
          D4EXAM
        </p>
      )}

      {/* Wave line + traveling beam — unique loading (no spinner) */}
      <div className="wave-loader-track" aria-hidden>
        <svg
          className="wave-loader-svg"
          viewBox="0 0 240 24"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="wave-loader-base"
            d="M0 12 Q20 4 40 12 T80 12 T120 12 T160 12 T200 12 T240 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            className="wave-loader-beam"
            d="M0 12 Q20 4 40 12 T80 12 T120 12 T160 12 T200 12 T240 12"
            fill="none"
            stroke="url(#waveGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="48 192"
          />
          <defs>
            <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="35%" stopColor="hsl(var(--primary) / 0.35)" />
              <stop offset="50%" stopColor="hsl(var(--primary))" />
              <stop offset="65%" stopColor="hsl(var(--primary) / 0.35)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <p className="max-w-[min(90vw,18rem)] text-center text-xs font-medium tracking-wide text-slate-500 sm:text-sm">
        {caption}
      </p>

      <span className="sr-only">Loading</span>

      <style>{`
        .wave-loader-track {
          width: min(72vw, 14rem);
          height: 1.5rem;
          color: hsl(var(--primary) / 0.22);
          position: relative;
          overflow: hidden;
        }
        .wave-loader-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .wave-loader-base {
          opacity: 1;
        }
        .wave-loader-beam {
          animation: wave-beam-run 1.35s linear infinite;
        }
        @keyframes wave-beam-run {
          0% { stroke-dashoffset: 240; }
          100% { stroke-dashoffset: -240; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wave-loader-beam {
            animation: none !important;
            stroke-dasharray: none;
            opacity: 0.7;
          }
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
