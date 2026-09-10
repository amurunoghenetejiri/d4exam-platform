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
