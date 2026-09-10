import { createElement, isValidElement, type ComponentType, type ElementType, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandLoader } from "@/components/brand/BrandLoader";

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
