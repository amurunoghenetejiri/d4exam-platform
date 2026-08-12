import type { ReactNode } from "react";
import { RecordsPage, type RecordsStat } from "@/components/pages/RecordsPage";
import type { Column } from "@/components/dashboard/kit";
import { useRows } from "@/lib/queries";

export type Row = Record<string, any>;

/**
 * Records page backed by the live database. Renders an empty state when the
 * school has no data yet — never placeholder rows.
 */
export function DbRecordsPage({
  title,
  description,
  table,
  select = "*",
  order,
  columns,
  tableTitle,
  actions,
  stats,
  children,
  enabled = true,
}: {
  title: string;
  description?: string;
  table?: string;
  select?: string;
  order?: { column: string; ascending?: boolean };
  columns: Column<Row>[];
  tableTitle?: string;
  actions?: ReactNode;
  stats?: RecordsStat[];
  children?: ReactNode;
  enabled?: boolean;
}) {
  const query = useRows<Row>({
    table: table ?? "schools",
    select,
    ...(order ? { order } : {}),
    enabled: enabled && Boolean(table),
  });

  const rows = (table ? (query.data ?? []) : []).map((r, i) => ({
    id: String(r["id"] ?? i),
    ...r,
  }));

  return (
    <RecordsPage
      title={title}
      {...(description ? { description } : {})}
      {...(actions ? { actions } : {})}
      {...(stats ? { stats } : {})}
      {...(tableTitle ? { tableTitle } : {})}
      columns={columns}
      rows={rows}
      loading={Boolean(table) && query.isLoading}
    >
      {children}
    </RecordsPage>
  );
}
