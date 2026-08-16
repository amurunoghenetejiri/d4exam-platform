import type { ReactNode, MouseEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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
  description?: string;
  actions?: ReactNode;
  /** @deprecated use actions */
  action?: ReactNode;
}) {
  const right = actions ?? action;
  return (
    <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500 sm:mt-1 sm:text-sm">{description}</p>
        ) : null}
      </div>
      {right ? <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

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
  const navigate = useNavigate();

  function go(e: MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    void navigate({
      to: to as never,
      params: (params ?? {}) as never,
      search: (search ?? {}) as never,
    });
  }

  return (
    <Link
      to={to as never}
      params={params as never}
      search={search as never}
      aria-label={ariaLabel}
      preload="intent"
      onClick={go}
      className={cn(
        "pressable pressable-soft block cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm sm:rounded-2xl sm:p-4",
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
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  trend?: { value: string; positive?: boolean };
}) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="flex items-start gap-2.5 p-3 sm:gap-3 sm:p-5">
        {icon ? (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10 sm:rounded-xl">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
            {label}
          </p>
          <p className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-900 sm:text-2xl">
            {value}
          </p>
          {hint ? <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">{hint}</p> : null}
          {trend ? (
            <p
              className={cn(
                "mt-1 text-xs font-semibold",
                trend.positive ? "text-emerald-600" : "text-red-600",
              )}
            >
              {trend.value}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-slate-100 shadow-sm", className)}>
      {(title || action) && (
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 px-3 pb-2 pt-3 sm:gap-3 sm:px-6 sm:pb-3 sm:pt-6">
          <div className="min-w-0">
            {title ? <CardTitle className="text-sm font-bold sm:text-base">{title}</CardTitle> : null}
            {description ? (
              <CardDescription className="mt-0.5 text-xs">{description}</CardDescription>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </CardHeader>
      )}
      <CardContent className={cn("px-3 pb-3 sm:px-6 sm:pb-6", !(title || action) && "pt-3 sm:pt-6")}>
        {children}
      </CardContent>
    </Card>
  );
}

/** Unified status palette — success / pending / error / info / neutral / live */
const STATUS_STYLES: Record<string, string> = {
  // Success / Completed / Approved → green
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  released: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  passed: "bg-emerald-50 text-emerald-700 border-emerald-200",

  // Pending / Processing / Waiting → amber
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  held: "bg-amber-50 text-amber-800 border-amber-200",
  "result held": "bg-amber-50 text-amber-800 border-amber-200",
  "pending officer review": "bg-amber-50 text-amber-800 border-amber-200",
  processing: "bg-amber-50 text-amber-800 border-amber-200",
  waiting: "bg-amber-50 text-amber-800 border-amber-200",
  upcoming: "bg-amber-50 text-amber-800 border-amber-200",

  // Error / Failed / Cancelled / Rejected → red
  rejected: "bg-red-50 text-red-700 border-red-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
  flagged: "bg-red-50 text-red-700 border-red-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  canceled: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  error: "bg-red-50 text-red-700 border-red-200",
  missed: "bg-red-50 text-red-700 border-red-200",
  fail: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",

  // Info / Scheduled → blue
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",

  // Live / Active window → blue-green
  ongoing: "bg-cyan-50 text-cyan-800 border-cyan-200",
  live: "bg-cyan-50 text-cyan-800 border-cyan-200",
  available: "bg-cyan-50 text-cyan-800 border-cyan-200",

  // Draft / Neutral → gray
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase().replaceAll("_", " ");
  const style =
    STATUS_STYLES[key] ?? STATUS_STYLES[status.toLowerCase()] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:px-2.5 sm:text-[11px]",
        style,
        className,
      )}
    >
      {status.replaceAll("_", " " )}
    </span>
  );
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyTitle = "No data",
  emptyDescription,
}: {
  columns: { key: string; header: string; render?: (row: T) => ReactNode; className?: string }[];
  rows: T[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="table-scroll overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn("px-2.5 py-2 sm:px-3 sm:py-2.5", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="bg-white hover:bg-slate-50/60">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-2.5 py-2 text-slate-800 sm:px-3 sm:py-2.5", c.className)}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
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
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center sm:rounded-2xl sm:px-6 sm:py-12">
      <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 sm:mb-3 sm:h-12 sm:w-12">
        <Inbox className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p> : null}
      {action ? <div className="mt-3 sm:mt-4">{action}</div> : null}
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
  return <Skeleton className="h-20 w-full rounded-xl sm:h-24 sm:rounded-2xl" />;
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-50 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}
