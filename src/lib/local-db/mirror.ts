/**
 * Step 3 — mirror online fetch results into local SQLite/memory.
 * Does not change UI. Does not implement full sync engine or offline CBT.
 */
import { initLocalDb, getLocalDb } from "./connection";
import { saveLocalSession } from "./repositories/sessionRepo";
import { upsertLocalEntity } from "./repositories/entityRepo";
import { setSyncCursor } from "./repositories/outboxRepo";
import { OfflineKeys } from "@/lib/offline-cache";

function blobKey(userId: string, key: string): string {
  return `blob:${userId}:${key}`;
}

/** Store exact query payload for offline re-read (alongside structured rows). */
export async function mirrorOfflineBlob(
  userId: string,
  key: string,
  data: unknown,
): Promise<void> {
  if (!userId || data === undefined) return;
  try {
    await initLocalDb();
    const db = getLocalDb();
    if (!db) return;
    await db.execute(
      `INSERT OR REPLACE INTO local_meta (key, value, updated_at) VALUES (?,?,datetime('now'))`,
      [blobKey(userId, key), JSON.stringify(data)],
    );
    await setSyncCursor(`blob:${key}`, userId, new Date().toISOString());
  } catch (e) {
    console.warn("[local-db] mirrorOfflineBlob failed", key, e);
  }
}

export async function readOfflineBlob<T>(
  userId: string,
  key: string,
): Promise<T | null> {
  if (!userId) return null;
  try {
    await initLocalDb();
    const db = getLocalDb();
    if (!db) return null;
    const res = await db.execute(`SELECT value FROM local_meta WHERE key = ?`, [
      blobKey(userId, key),
    ]);
    const raw = res.rows[0]?.value;
    if (typeof raw !== "string") return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type SessionLike = {
  userId?: string;
  profileId?: string | null;
  email?: string | null;
  fullName?: string | null;
  status?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  roles?: string[];
  role?: string | null;
};

/** Mirror SessionUser into local_session (no secrets). */
export async function mirrorSessionUser(user: SessionLike | null | undefined): Promise<void> {
  if (!user?.userId) return;
  try {
    await saveLocalSession({
      userId: user.userId,
      profileId: user.profileId,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      schoolId: user.schoolId,
      schoolName: user.schoolName,
      roles: user.roles ?? [],
      primaryRole: user.role ?? null,
      hasRefreshSession: true,
      payload: {
        fullName: user.fullName,
        schoolName: user.schoolName,
        roles: user.roles,
      },
    });
    await mirrorOfflineBlob(user.userId, OfflineKeys.sessionUser, user);
  } catch (e) {
    console.warn("[local-db] mirrorSessionUser failed", e);
  }
}

type ExamRowLike = {
  id?: string;
  title?: string | null;
  status?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  duration_minutes?: number | null;
  course_id?: string | null;
  school_id?: string | null;
};

export async function mirrorExaminations(
  userId: string,
  schoolId: string | null | undefined,
  rows: ExamRowLike[] | null | undefined,
): Promise<void> {
  if (!userId || !rows?.length) {
    if (userId) await mirrorOfflineBlob(userId, OfflineKeys.studentDashboardExams, rows ?? []);
    return;
  }
  try {
    for (const row of rows) {
      if (!row?.id) continue;
      await upsertLocalEntity(
        "local_examinations",
        row.id,
        {
          school_id: schoolId ?? row.school_id ?? null,
          course_id: row.course_id ?? null,
          title: row.title ?? null,
          status: row.status ?? null,
          scheduled_start: row.scheduled_start ?? null,
          scheduled_end: row.scheduled_end ?? null,
          duration_minutes: row.duration_minutes ?? null,
          payload: row,
        },
        { syncStatus: "synced" },
      );
    }
    await mirrorOfflineBlob(userId, OfflineKeys.studentDashboardExams, rows);
  } catch (e) {
    console.warn("[local-db] mirrorExaminations failed", e);
  }
}

type NotifLike = {
  id?: string;
  recipient_user_id?: string | null;
  school_id?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  type?: string | null;
  link?: string | null;
  href?: string | null;
  read_at?: string | null;
  created_at?: string | null;
};

export async function mirrorNotifications(
  userId: string,
  rows: NotifLike[] | null | undefined,
): Promise<void> {
  await mirrorOfflineBlob(userId, OfflineKeys.studentDashboardNotifs, rows ?? []);
  await mirrorOfflineBlob(userId, OfflineKeys.notifications, rows ?? []);
  if (!rows?.length) return;
  try {
    for (const row of rows) {
      if (!row?.id) continue;
      await upsertLocalEntity(
        "local_notifications",
        row.id,
        {
          recipient_user_id: row.recipient_user_id || userId,
          school_id: row.school_id ?? null,
          title: row.title ?? null,
          message: row.message ?? row.body ?? null,
          type: row.type ?? null,
          link: row.link ?? row.href ?? null,
          read_at: row.read_at ?? null,
          created_at: row.created_at ?? null,
          payload: row,
        },
        { syncStatus: "synced" },
      );
    }
  } catch (e) {
    console.warn("[local-db] mirrorNotifications failed", e);
  }
}

type ResultLike = {
  id?: string;
  student_id?: string | null;
  exam_id?: string | null;
  school_id?: string | null;
  score?: number | null;
  max_score?: number | null;
  total_score?: number | null;
  published?: boolean | number | null;
};

export async function mirrorResults(
  userId: string,
  studentId: string | null | undefined,
  rows: ResultLike[] | null | undefined,
): Promise<void> {
  await mirrorOfflineBlob(userId, OfflineKeys.studentDashboardResults, rows ?? []);
  await mirrorOfflineBlob(userId, OfflineKeys.studentResults, rows ?? []);
  if (!rows?.length) return;
  try {
    for (const row of rows) {
      if (!row?.id) continue;
      await upsertLocalEntity(
        "local_results",
        row.id,
        {
          student_id: row.student_id ?? studentId ?? null,
          exam_id: row.exam_id ?? null,
          school_id: row.school_id ?? null,
          score: row.score ?? row.total_score ?? null,
          max_score: row.max_score ?? null,
          published: Boolean(row.published),
          payload: row,
        },
        { syncStatus: "synced" },
      );
    }
  } catch (e) {
    console.warn("[local-db] mirrorResults failed", e);
  }
}

/**
 * Key-aware mirror after a successful network fetch.
 * Safe no-op for unknown keys (still stores blob).
 */
export async function mirrorByOfflineKey(
  userId: string,
  key: string,
  data: unknown,
  opts?: { schoolId?: string | null; studentId?: string | null },
): Promise<void> {
  if (!userId) return;
  try {
    await mirrorOfflineBlob(userId, key, data);

    if (key === OfflineKeys.sessionUser && data && typeof data === "object") {
      await mirrorSessionUser(data as SessionLike);
      return;
    }
    if (key === OfflineKeys.studentDashboardExams && Array.isArray(data)) {
      await mirrorExaminations(userId, opts?.schoolId, data as ExamRowLike[]);
      return;
    }
    if (
      (key === OfflineKeys.studentDashboardNotifs || key === OfflineKeys.notifications) &&
      Array.isArray(data)
    ) {
      await mirrorNotifications(userId, data as NotifLike[]);
      return;
    }
    if (
      (key === OfflineKeys.studentDashboardResults || key === OfflineKeys.studentResults) &&
      Array.isArray(data)
    ) {
      await mirrorResults(userId, opts?.studentId, data as ResultLike[]);
      return;
    }
  } catch (e) {
    console.warn("[local-db] mirrorByOfflineKey failed", key, e);
  }
}
