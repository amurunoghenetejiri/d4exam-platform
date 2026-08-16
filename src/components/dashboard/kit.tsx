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
    <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-xl font-extrabold leading-snug tracking-tight text-slate-900 sm:text-2xl sm:text-[1.75rem]">
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
  to,
  search,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  to?: string;
  search?: Record<string, string | undefined>;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p>
          <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
          {hint ? <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:h-10 sm:w-10">
            {icon}
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
    <Card className={cn("rounded-xl border-slate-200 shadow-sm sm:rounded-2xl", className)}>
      <CardContent className="p-3 sm:p-4">{body}</CardContent>
    </Card>
  );
}

export function SectionCard({
  title,
  description,
  children,
  actions,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden rounded-xl border-slate-200 shadow-sm sm:rounded-2xl", className)}>
      {(title || description || actions) && (
        <CardHeader className="flex flex-col gap-2 border-b border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <div className="min-w-0">
            {title ? <CardTitle className="text-sm font-bold text-slate-900 sm:text-base">{title}</CardTitle> : null}
            {description ? (
              <CardDescription className="mt-0.5 text-xs text-slate-500">{description}</CardDescription>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </CardHeader>
      )}
      <CardContent className="px-3 py-3 sm:px-5 sm:py-4">{children}</CardContent>
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
  const key = status.toLowerCase().replaceAll("_", " ");
  const style = STATUS_STYLES[key] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:text-[11px]",
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
  emptyTitle = "No records",
  emptyDescription,
}: {
  columns: { key: string; header: string; render: (row: T) => ReactNode }[];
  rows: T[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-2 sm:px-3">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-50 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-2.5 align-top sm:px-3">
                  {c.render(row)}
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center sm:rounded-2xl sm:px-6 sm:py-12">
      <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400 sm:mb-3 sm:h-12 sm:w-12">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p> : null}
      {action ? <div className="mt-3 sm:mt-4">{action}</div> : null}
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
  return <Skeleton className="h-20 w-full rounded-xl sm:h-24 sm:rounded-2xl" />;
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-slate-50 py-2 last:border-0">
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
