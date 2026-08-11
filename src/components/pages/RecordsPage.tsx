import { useMemo, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Column,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  SectionCard,
  TableSkeleton,
} from "@/components/dashboard/kit";
import type { LucideIcon } from "lucide-react";

export interface RecordsStat {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "primary" | "aqua" | "warning" | "info" | "destructive";
}

export function RecordsPage<T extends { id: string }>({
  title,
  description,
  actions,
  stats,
  columns,
  rows,
  searchKeys,
  filter,
  children,
  tableTitle,
  loading = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  stats?: RecordsStat[];
  columns: Column<T>[];
  rows: T[];
  searchKeys?: (keyof T)[];
  filter?: { label: string; key: keyof T; options: string[] };
  children?: ReactNode;
  tableTitle?: string;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filterValue, setFilterValue] = useState("all");

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesQuery =
        !query ||
        (searchKeys ?? (Object.keys(row) as (keyof T)[])).some((k) =>
          String(row[k] ?? "")
            .toLowerCase()
            .includes(query.toLowerCase()),
        );
      const matchesFilter =
        !filter ||
        filterValue === "all" ||
        String(row[filter.key]).toLowerCase() === filterValue.toLowerCase();
      return matchesQuery && matchesFilter;
    });
  }, [rows, query, filter, filterValue, searchKeys]);

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />

      {stats && stats.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      )}

      {children && <div className="mb-6">{children}</div>}

      <SectionCard
        title={tableTitle ?? "Records"}
        action={
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {rows.length}
          </span>
        }
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search records…"
              aria-label="Search records"
              className="bg-background pl-9"
            />
          </div>
          {filter && (
            <Select value={filterValue} onValueChange={setFilterValue}>
              <SelectTrigger className="w-full sm:w-48" aria-label={filter.label}>
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {filter.label}</SelectItem>
                {filter.options.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" className="shrink-0 gap-2">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
          </Button>
        </div>

        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            caption={title}
            empty={
              <EmptyState
                title="No matching records"
                description="Try adjusting your search or filters to find what you're looking for."
              />
            }
          />
        )}
      </SectionCard>
    </>
  );
}
