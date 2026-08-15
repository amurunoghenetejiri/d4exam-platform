import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}

/**
 * Clickable dashboard / list card. Uses a real anchor so navigation always works
 * (including open-in-new-tab) and is keyboard accessible.
 */
export function NavCard({
  to,
  search,
  children,
  className,
  ariaLabel,
}: {
  to: string;
  search?: Record<string, string | undefined>;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      aria-label={ariaLabel}
      className={cn(
        "block cursor-pointer rounded-2xl border border-slate-200 bg-white/90 p-4 text-left shadow-sm transition",
        "hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
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
  icon: Icon,
  tone = "primary",
  hint,
  to,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "primary" | "aqua" | "warning" | "info" | "destructive";
  hint?: string;
  /** When set, the whole card navigates here */
  to?: string;
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/12 text-primary",
    aqua: "bg-aqua/12 text-aqua",
    warning: "bg-warning/12 text-warning",
    info: "bg-info/12 text-info",
    destructive: "bg-destructive/12 text-destructive",
  };

  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 font-display text-2xl font-bold sm:text-3xl">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
    </div>
  );

  if (to) {
    return (
      <NavCard to={to} ariaLabel={label} className="surface-panel p-4 sm:p-5">
        {body}
      </NavCard>
    );
  }

  return <div className="surface-panel p-4 sm:p-5">{body}</div>;
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
    <section className={cn("surface-panel overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold sm:text-base">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

const statusTones: Record<string, string> = {
  published: "border-primary/30 bg-primary/12 text-primary",
  approved: "border-primary/30 bg-primary/12 text-primary",
  completed: "border-primary/30 bg-primary/12 text-primary",
  marked: "border-primary/30 bg-primary/12 text-primary",
  success: "border-primary/30 bg-primary/12 text-primary",
  pass: "border-emerald-300 bg-emerald-50 text-emerald-700",
  passed: "border-emerald-300 bg-emerald-50 text-emerald-700",
  ready: "border-emerald-300 bg-emerald-50 text-emerald-700",
  ongoing: "border-aqua/30 bg-aqua/12 text-aqua",
  live: "border-aqua/30 bg-aqua/12 text-aqua",
  scheduled: "border-info/30 bg-info/12 text-info",
  "under review": "border-info/30 bg-info/12 text-info",
  pending: "border-warning/30 bg-warning/12 text-warning",
  "pending approval": "border-warning/30 bg-warning/12 text-warning",
  pending_approval: "border-warning/30 bg-warning/12 text-warning",
  "changes requested": "border-info/30 bg-info/12 text-info",
  changes_requested: "border-info/30 bg-info/12 text-info",
  "awaiting marking": "border-warning/30 bg-warning/12 text-warning",
  "awaiting release": "border-warning/30 bg-warning/12 text-warning",
  awaiting_release: "border-warning/30 bg-warning/12 text-warning",
  trial: "border-warning/30 bg-warning/12 text-warning",
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
  rejected: "border-destructive/30 bg-destructive/12 text-destructive",
  suspended: "border-destructive/30 bg-destructive/12 text-destructive",
  flagged: "border-destructive/30 bg-destructive/12 text-destructive",
  fail: "border-destructive/30 bg-destructive/12 text-destructive",
  failed: "border-destructive/30 bg-destructive/12 text-destructive",
  high: "border-destructive/30 bg-destructive/12 text-destructive",
  medium: "border-warning/30 bg-warning/12 text-warning",
  low: "border-info/30 bg-info/12 text-info",
};

function displayStatus(status: string): string {
  const key = status.toLowerCase().trim();
  if (key === "active") return "Available";
  return status.replaceAll("_", " ");
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase().trim();
  const label = displayStatus(status);
  const toneKey = key === "active" ? "ready" : key;
  const tone = statusTones[toneKey] ?? statusTones["draft"];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize",
        tone,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
  caption?: string;
}) {
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="No records found" />}</>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  c.hideOnMobile && "hidden md:table-cell",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-3 align-middle",
                    c.hideOnMobile && "hidden md:table-cell",
                    c.className,
                  )}
                >
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
  title = "Nothing here yet",
  description,
  actionLabel,
  onAction,
  icon: Icon = Inbox,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actionLabel && (
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. Please try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-6 py-10 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-16" />
    </Card>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span className="truncate text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}
