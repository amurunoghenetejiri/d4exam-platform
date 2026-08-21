import { createElement, isValidElement, type ComponentType, type ElementType, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeader({
  title,
  description,
  actions,
  action,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** @deprecated use actions */
  action?: ReactNode;
}) {
  const right = actions ?? action;
  return (
    <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4 lg:mb-8">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-extrabold leading-snug tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
          {title}
        </h1>
        {description ? (
          <div className="mt-0.5 max-w-3xl text-xs leading-snug text-slate-500 sm:mt-1.5 sm:text-sm lg:mt-2 lg:max-w-4xl lg:text-[0.9375rem] lg:leading-relaxed">
            {description}
          </div>
        ) : null}
      </div>
      {right ? <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/**
 * Clickable card that uses the router Link only.
 * Do NOT call preventDefault + navigate() — that fights TanStack Router and
 * causes client-side navigations that only complete after a hard refresh.
 */
export function NavCard({
  to,
  search,
  params,
  children,
  className,
  ariaLabel,
}: {
  to: string;
  search?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Link
      to={to as never}
      {...(params ? { params: params as never } : {})}
      {...(search ? { search: search as never } : {})}
      aria-label={ariaLabel}
      preload="intent"
      className={cn(
        "pressable pressable-soft block cursor-pointer rounded-xl border border-slate-200/90 bg-white p-2.5 text-left shadow-sm sm:rounded-2xl sm:p-4 lg:p-5",
        "hover:border-primary/40 hover:shadow-md",
        "active:scale-[0.985] active:border-primary/50 active:bg-primary/5 active:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  to,
  search,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode | ElementType;
  /** Optional accent tone for the icon chip. */
  tone?: "primary" | "aqua" | "warning" | "info" | "destructive";
  to?: string;
  search?: Record<string, string | undefined>;
  className?: string;
}) {
  void tone;
  // Lucide icons are forwardRef objects rather than plain functions. Render any
  // element type through React instead of passing that object through as a child.
  const isIconType =
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && !isValidElement(icon) && "$$typeof" in icon);
  const renderedIcon: ReactNode = isIconType
    ? createElement(icon as ElementType, { className: "h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" })
    : (icon as ReactNode);

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs lg:text-[13px]">{label}</p>
          <p className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-900 sm:mt-1 sm:text-2xl lg:text-3xl">{value}</p>
          {hint ? <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs lg:text-sm">{hint}</p> : null}
        </div>
        {renderedIcon ? (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10 sm:rounded-xl lg:h-12 lg:w-12">
            {renderedIcon}
          </div>
        ) : null}
      </div>
    </>
  );

  if (to) {
    return (
      <NavCard to={to} search={search} className={className} ariaLabel={label}>
        {body}
      </NavCard>
    );
  }

  return (
    <Card className={cn("rounded-xl border-slate-200/90 shadow-sm sm:rounded-2xl", className)}>
      <CardContent className="p-2.5 sm:p-4 lg:p-5">{body}</CardContent>
    </Card>
  );
}

export function SectionCard({
  title,
  description,
  children,
  actions,
  action,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** @deprecated use actions */
  action?: ReactNode;
  className?: string;
}) {
  const right = actions ?? action;
  return (
    <Card className={cn("overflow-hidden rounded-xl border-slate-200/90 shadow-sm sm:rounded-2xl", className)}>
      {(title || description || right) && (
        <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-5 sm:py-4 lg:px-6 lg:py-5">
          <div className="min-w-0">
            {title ? <CardTitle className="text-[13px] font-bold text-slate-900 sm:text-base lg:text-lg">{title}</CardTitle> : null}
            {description ? (
              <CardDescription className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 sm:text-xs lg:line-clamp-none lg:text-sm">{description}</CardDescription>
            ) : null}
          </div>
          {right ? <div className="flex shrink-0 flex-wrap gap-1.5">{right}</div> : null}
        </CardHeader>
      )}
      <CardContent className="px-3 py-2.5 sm:px-5 sm:py-4 lg:px-6 lg:py-5">{children}</CardContent>
    </Card>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  "pending approval": "bg-amber-50 text-amber-700 border-amber-200",
  "changes requested": "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  ongoing: "bg-blue-50 text-blue-700 border-blue-200",
  live: "bg-blue-50 text-blue-700 border-blue-200",
  active: "bg-blue-50 text-blue-700 border-blue-200",
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const safe = String(status ?? "");
  const key = safe.toLowerCase().split("_").join(" ");
  const style = STATUS_STYLES[key] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:text-[11px]",
        style,
        className,
      )}
    >
      {safe.split("_").join(" ")}
    </span>
  );
}

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  hideOnMobile?: boolean;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyTitle = "No records",
  emptyDescription,
  caption,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyDescription?: string;
  caption?: string;
  empty?: ReactNode;
}) {
  if (!rows.length) {
    return <>{empty ?? <EmptyState title={emptyTitle} description={emptyDescription} />}</>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn("px-2 py-2 sm:px-3 lg:px-4", c.hideOnMobile && "hidden sm:table-cell")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-50 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-2 py-2.5 align-top sm:px-3 lg:px-4 lg:py-3", c.hideOnMobile && "hidden sm:table-cell")}
                >
                  {c.render
                    ? c.render(row)
                    : ((row as Record<string, unknown>)[c.key] as ReactNode) ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  actionLabel,
  onAction,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ComponentType<{ className?: string }>;
}) {
  const resolvedAction =
    action ??
    (actionLabel ? (
      <Button size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null);
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center sm:rounded-2xl sm:px-6 sm:py-12 lg:py-14">
      <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 sm:mb-3 sm:h-12 sm:w-12 lg:h-14 lg:w-14">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
      </div>
      <p className="text-sm font-bold text-slate-800 sm:text-base">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-slate-500 sm:text-sm">{description}</p> : null}
      {resolvedAction ? <div className="mt-3 sm:mt-4">{resolvedAction}</div> : null}
    </div>
  );
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50/40 px-4 py-8 text-center sm:rounded-2xl sm:px-6 sm:py-10">
      <AlertCircle className="mb-2 h-7 w-7 text-red-500 sm:h-8 sm:w-8" />
      <p className="text-sm font-bold text-red-900">{title}</p>
      {description ? <p className="mt-1 text-xs text-red-700">{description}</p> : null}
      {onRetry ? (
        <Button className="mt-3 sm:mt-4" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return <Skeleton className="h-20 w-full rounded-xl sm:h-24 sm:rounded-2xl lg:h-28" />;
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-slate-50 py-2 last:border-0 lg:py-2.5">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <span className="shrink-0 text-xs text-slate-500 sm:text-sm">{label}</span>
        <span className="min-w-0 break-words text-sm font-semibold leading-snug text-slate-900 sm:text-right [overflow-wrap:anywhere]">
          {value}
        </span>
      </div>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}
