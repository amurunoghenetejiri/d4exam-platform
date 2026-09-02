import { supabase } from "@/integrations/supabase/client";
import { getSyncCursor, setSyncCursor, type SyncScope } from "@/lib/sync/cursors";
import { upsertLocalRows } from "@/lib/local-db/mirror";

type PullCtx = {
  userId: string;
  schoolId: string | null;
};

export type PullResult = {
  scopes: Partial<Record<SyncScope, "ok" | "skip" | "fail">>;
  errors: string[];
};

async function pullNotifications(ctx: PullCtx): Promise<number> {
  const cursor = await getSyncCursor("notifications", ctx.userId);
  let q = supabase
    .from("notifications")
    .select("id, title, message, type, link, href, read_at, created_at, recipient_user_id, user_id, school_id")
    .order("created_at", { ascending: true })
    .limit(120);

  q = q.or(`recipient_user_id.eq.${ctx.userId},user_id.eq.${ctx.userId}`);

  if (cursor?.cursor) {
    q = q.gt("created_at", cursor.cursor);
  }

  const { data, error } = await q;
  if (error) {
    const { data: d2, error: e2 } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_user_id", ctx.userId)
      .order("created_at", { ascending: true })
      .limit(120);
    if (e2) throw e2;
    const rows = d2 ?? [];
    if (rows.length) {
      await upsertLocalRows("notifications", rows as never[]);
      const last = rows[rows.length - 1] as { created_at?: string };
      if (last?.created_at) await setSyncCursor("notifications", ctx.userId, last.created_at);
    }
    return rows.length;
  }
  const rows = data ?? [];
  if (rows.length) {
    await upsertLocalRows("notifications", rows as never[]);
    const last = rows[rows.length - 1] as { created_at?: string };
    if (last?.created_at) await setSyncCursor("notifications", ctx.userId, last.created_at);
  }
  return rows.length;
}

/** Pull scoped tables for offline use. Failures are recorded, never fatal. */
export async function pullAllScopes(ctx: PullCtx): Promise<PullResult> {
  const result: PullResult = { scopes: {}, errors: [] };

  try {
    const n = await pullNotifications(ctx);
    result.scopes.notifications = "ok";
    void n;
  } catch (e) {
    result.scopes.notifications = "fail";
    result.errors.push(`notifications: ${(e as Error).message || String(e)}`);
  }

  return result;
}
