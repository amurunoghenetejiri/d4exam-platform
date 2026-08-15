import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { useSchoolIdentity } from "@/lib/school-identity";
import { useSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * School identity for result slips / certificates.
 * Prefer DB school logo + name; fall back to session; never bare D4EXAM as the primary brand.
 */
export function SchoolResultHeader({
  schoolId,
  className,
  size = "lg",
  centered = false,
}: {
  schoolId?: string | null;
  className?: string;
  size?: "md" | "lg" | "xl";
  centered?: boolean;
}) {
  const { data: session } = useSessionUser();
  const { data: school } = useSchoolIdentity(schoolId ?? session?.schoolId);

  const logoUrl = school?.logoUrl ?? session?.schoolLogoUrl ?? null;
  const name =
    school?.name ?? session?.schoolName ?? "School";
  const code = school?.schoolCode ?? session?.schoolCode ?? null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        centered && "flex-col justify-center text-center",
        className,
      )}
    >
      <SchoolLogo
        logoUrl={logoUrl}
        schoolName={name}
        size={size}
        className="shrink-0 bg-transparent"
      />
      <div className={cn("min-w-0", centered && "text-center")}>
        <p className="truncate text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
          {name}
        </p>
        {code ? (
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {code}
          </p>
        ) : null}
        <p className="mt-0.5 text-[10px] font-medium text-slate-400">
          Examination result · Powered by D4EXAM
        </p>
      </div>
    </div>
  );
}
