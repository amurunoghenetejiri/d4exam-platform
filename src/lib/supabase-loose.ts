import { supabase } from "@/integrations/supabase/client";

/**
 * Untyped view of the Supabase client.
 *
 * Some code paths query legacy / optional tables and RPCs that are not part of
 * the generated `Database` types (e.g. `question_options`, `course_enrollments`,
 * `get_cbt_exam_questions`). Those calls are always guarded by error handling and
 * fall back to the typed tables, so they are intentionally untyped here instead of
 * being suppressed one by one.
 */
type LooseQuery = {
  select: (cols?: string) => LooseQuery;
  insert: (values: unknown) => LooseQuery;
  update: (values: unknown) => LooseQuery;
  delete: () => LooseQuery;
  eq: (col: string, value: unknown) => LooseQuery;
  is: (col: string, value: unknown) => LooseQuery;
  in: (col: string, values: unknown[]) => LooseQuery;
  order: (col: string, opts?: { ascending?: boolean }) => LooseQuery;
  limit: (n: number) => LooseQuery;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

export type LooseClient = {
  from: (table: string) => LooseQuery;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export const sbLoose = supabase as unknown as LooseClient;

export function looseClient(client: unknown): LooseClient {
  return client as LooseClient;
}
