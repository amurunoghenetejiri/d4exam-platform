import type { ComponentType, ReactNode, MouseEvent } from "react";
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p> : null}
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
        "pressable pressable-soft block cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm",
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
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        {icon ? (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-900">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
          {trend ? (
            <p className={cn("mt-1 text-xs font-semibold", trend.positive ? "text-emerald-600" : "text-red-600")}>
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
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0">
            {title ? <CardTitle className="text-base font-bold">{title}</CardTitle> : null}
            {description ? <CardDescription className="mt-0.5">{description}</CardDescription> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </CardHeader>
      )}
      <CardContent className={cn(!(title || action) && "pt-6")}>{children}</CardContent>
    </Card>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  released: "bg-emerald-50 text-emerald-700 border-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  submitted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
  closed: "bg-slate-100 text-slate-700 border-slate-200",
  archived: "bg-slate-100 text-slate-600 border-slate-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  held: "bg-amber-50 text-amber-800 border-amber-200",
  "result held": "bg-amber-50 text-amber-800 border-amber-200",
  "under review": "bg-amber-50 text-amber-800 border-amber-200",
  "pending review": "bg-amber-50 text-amber-800 border-amber-200",
  "pending officer review": "bg-amber-50 text-amber-800 border-amber-200",
  "pending approval": "bg-amber-50 text-amber-800 border-amber-200",
  "changes requested": "bg-amber-50 text-amber-800 border-amber-200",
  invited: "bg-amber-50 text-amber-800 border-amber-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  ongoing: "bg-blue-50 text-blue-700 border-blue-200",
  live: "bg-blue-50 text-blue-700 border-blue-200",
  scheduled: "bg-indigo-50 text-indigo-700 border-indigo-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  "in progress": "bg-blue-50 text-blue-700 border-blue-200",
  draft: "bg-slate-50 text-slate-600 border-slate-200",
  inactive: "bg-slate-50 text-slate-500 border-slate-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
  flagged: "bg-red-50 text-red-700 border-red-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  fail: "bg-red-50 text-red-700 border-red-200",
  missed: "bg-red-50 text-red-700 border-red-200",
  deactivated: "bg-red-50 text-red-700 border-red-200",
  locked: "bg-red-50 text-red-700 border-red-200",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase().replaceAll("_", " ");
  const style = STATUS_STYLES[key] ?? STATUS_STYLES[status.toLowerCase()] ?? "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        style,
        className,
      )}
    >
      {status.replaceAll("_", " ")}
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
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn("px-3 py-2.5", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="bg-white hover:bg-slate-50/60">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2.5 text-slate-800", c.className)}>
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
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center sm:px-6 sm:py-12">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400 sm:h-12 sm:w-12">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/40 px-6 py-10 text-center">
      <AlertCircle className="mb-2 h-8 w-8 text-red-500" />
      <p className="text-sm font-bold text-red-900">{title}</p>
      {description ? <p className="mt-1 text-xs text-red-700">{description}</p> : null}
      {onRetry ? (
        <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>
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
  return <Skeleton className="h-24 w-full rounded-2xl" />;
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-50 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}
