/**
 * Role-scoped pull from Supabase → local SQLite.
 * Uses updated_at / created_at cursors. Server-authoritative for results & exams.
 * Does NOT download other students' private data.
 */
import { supabase } from "@/integrations/supabase/client";
import { getSyncCursor, setSyncCursor } from "@/lib/local-db/repositories/outboxRepo";
import {
  mirrorNotifications,
  mirrorExaminations,
  mirrorResults,
} from "@/lib/local-db/mirror";
import type { SyncScope } from "./types";

export type PullCtx = {
  userId: string;
  schoolId?: string | null;
  role?: string | null;
  studentId?: string | null;
  profileId?: string | null;
};

export type PullSummary = {
  pulled: number;
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
    if (e2) throw new Error(e2.message);
    await mirrorNotifications(ctx.userId, d2 as never[]);
    const last = d2?.length ? String((d2[d2.length - 1] as { created_at?: string }).created_at || "") : null;
    if (last) await setSyncCursor("notifications", ctx.userId, last);
    return d2?.length ?? 0;
  }

  await mirrorNotifications(ctx.userId, data as never[]);
  const last = data?.length
    ? String((data[data.length - 1] as { created_at?: string }).created_at || "")
    : null;
  if (last) await setSyncCursor("notifications", ctx.userId, last);
  return data?.length ?? 0;
}

async function pullExamsMeta(ctx: PullCtx): Promise<number> {
  if (!ctx.schoolId) return 0;
  const role = (ctx.role || "").toLowerCase();
  if (role === "super_admin") return 0;

  const cursor = await getSyncCursor("examinations", ctx.userId);
  let q = supabase
    .from("examinations")
    .select(
      "id, title, status, scheduled_start, scheduled_end, duration_minutes, course_id, school_id, updated_at",
    )
    .eq("school_id", ctx.schoolId)
    .order("updated_at", { ascending: true })
    .limit(80);

  if (cursor?.cursor) q = q.gt("updated_at", cursor.cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  await mirrorExaminations(ctx.userId, ctx.schoolId, data as never[]);
  const last = data?.length
    ? String((data[data.length - 1] as { updated_at?: string }).updated_at || "")
    : null;
  if (last) await setSyncCursor("examinations", ctx.userId, last);
  return data?.length ?? 0;
}

async function pullResults(ctx: PullCtx): Promise<number> {
  const role = (ctx.role || "").toLowerCase();
  if (role !== "student") return 0;
  if (!ctx.studentId && !ctx.profileId) return 0;

  const cursor = await getSyncCursor("results", ctx.userId);
  let q = supabase
    .from("results")
    .select("id, student_id, exam_id, school_id, score, max_score, total_score, published, updated_at, created_at")
    .order("updated_at", { ascending: true })
    .limit(80);

  if (ctx.studentId) q = q.eq("student_id", ctx.studentId);
  if (cursor?.cursor) q = q.gt("updated_at", cursor.cursor);

  const { data, error } = await q;
  if (error) {
    console.warn("[sync/pull] results", error.message);
    return 0;
  }

  await mirrorResults(ctx.userId, ctx.studentId, data as never[]);
  const last = data?.length
    ? String(
        (data[data.length - 1] as { updated_at?: string; created_at?: string }).updated_at ||
          (data[data.length - 1] as { created_at?: string }).created_at ||
          "",
      )
    : null;
  if (last) await setSyncCursor("results", ctx.userId, last);
  return data?.length ?? 0;
}

export async function pullScopedData(ctx: PullCtx): Promise<PullSummary> {
  const summary: PullSummary = { pulled: 0, scopes: {}, errors: [] };

  if (!ctx.userId) {
    summary.scopes.USER_PROFILE = "skip";
    return summary;
  }

  try {
    summary.scopes.NOTIFICATIONS = "ok";
    summary.pulled += await pullNotifications(ctx);
  } catch (e) {
    summary.scopes.NOTIFICATIONS = "fail";
    summary.errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    const n = await pullExamsMeta(ctx);
    summary.scopes.EXAMINATIONS_META = "ok";
    summary.pulled += n;
  } catch (e) {
    summary.scopes.EXAMINATIONS_META = "fail";
    summary.errors.push(e instanceof Error ? e.message : String(e));
  }

  try {
    const n = await pullResults(ctx);
    summary.scopes.RESULTS = (ctx.role || "").toLowerCase() === "student" ? "ok" : "skip";
    summary.pulled += n;
  } catch (e) {
    summary.scopes.RESULTS = "fail";
    summary.errors.push(e instanceof Error ? e.message : String(e));
  }

  return summary;
}
