import { getLocalDb, initLocalDb } from "../connection";
import type { SyncStatus } from "../types";

type EntityTable =
  | "local_schools"
  | "local_courses"
  | "local_examinations"
  | "local_exam_settings"
  | "local_notifications"
  | "local_results"
  | "local_materials"
  | "local_exam_attempts"
  | "local_integrity_events";

async function db() {
  return getLocalDb() || (await initLocalDb());
}

/** Upsert a server-backed row by id into a local table (payload as JSON). */
export async function upsertLocalEntity(
  table: EntityTable,
  id: string,
  fields: Record<string, unknown>,
  opts?: { syncStatus?: SyncStatus },
): Promise<void> {
  const exec = await db();
  if (!exec) return;
  const syncStatus = opts?.syncStatus ?? "synced";
  const now = new Date().toISOString();
  const payload =
    fields.payload_json != null
      ? String(fields.payload_json)
      : fields.payload != null
        ? JSON.stringify(fields.payload)
        : null;

  if (table === "local_exam_settings") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_exam_settings (exam_id, payload_json, updated_at, last_synced_at, sync_status)
       VALUES (?,?,?,?,?)`,
      [id, payload, now, now, syncStatus],
    );
    return;
  }

  if (table === "local_schools") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_schools (id, name, code, payload_json, updated_at, last_synced_at, sync_status, deleted_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        id,
        fields.name ?? null,
        fields.code ?? null,
        payload,
        fields.updated_at ?? now,
        now,
        syncStatus,
        fields.deleted_at ?? null,
      ],
    );
    return;
  }

  if (table === "local_courses") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_courses (id, school_id, code, name, payload_json, updated_at, last_synced_at, sync_status, deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        fields.school_id ?? null,
        fields.code ?? null,
        fields.name ?? null,
        payload,
        fields.updated_at ?? now,
        now,
        syncStatus,
        fields.deleted_at ?? null,
      ],
    );
    return;
  }

  if (table === "local_examinations") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_examinations (
        id, school_id, course_id, title, status, scheduled_start, scheduled_end, duration_minutes,
        payload_json, updated_at, last_synced_at, sync_status, deleted_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        fields.school_id ?? null,
        fields.course_id ?? null,
        fields.title ?? null,
        fields.status ?? null,
        fields.scheduled_start ?? null,
        fields.scheduled_end ?? null,
        fields.duration_minutes ?? null,
        payload,
        fields.updated_at ?? now,
        now,
        syncStatus,
        fields.deleted_at ?? null,
      ],
    );
    return;
  }

  if (table === "local_notifications") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_notifications (
        id, recipient_user_id, school_id, title, message, type, link, read_at, created_at,
        payload_json, last_synced_at, sync_status, deleted_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        fields.recipient_user_id ?? "",
        fields.school_id ?? null,
        fields.title ?? null,
        fields.message ?? null,
        fields.type ?? null,
        fields.link ?? null,
        fields.read_at ?? null,
        fields.created_at ?? now,
        payload,
        now,
        syncStatus,
        fields.deleted_at ?? null,
      ],
    );
    return;
  }

  if (table === "local_results") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_results (
        id, student_id, exam_id, school_id, score, max_score, published,
        payload_json, updated_at, last_synced_at, sync_status, deleted_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        fields.student_id ?? null,
        fields.exam_id ?? null,
        fields.school_id ?? null,
        fields.score ?? null,
        fields.max_score ?? null,
        fields.published ? 1 : 0,
        payload,
        fields.updated_at ?? now,
        now,
        syncStatus,
        fields.deleted_at ?? null,
      ],
    );
    return;
  }

  if (table === "local_materials") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_materials (id, school_id, title, payload_json, updated_at, last_synced_at, sync_status, deleted_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        id,
        fields.school_id ?? null,
        fields.title ?? null,
        payload,
        fields.updated_at ?? now,
        now,
        syncStatus,
        fields.deleted_at ?? null,
      ],
    );
    return;
  }

  if (table === "local_exam_attempts") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_exam_attempts (
        id, exam_id, student_id, status, started_at, submitted_at, answers_json, payload_json,
        client_mutation_id, updated_at, last_synced_at, sync_status, deleted_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        fields.exam_id ?? null,
        fields.student_id ?? null,
        fields.status ?? null,
        fields.started_at ?? null,
        fields.submitted_at ?? null,
        fields.answers_json ?? null,
        payload,
        fields.client_mutation_id ?? null,
        fields.updated_at ?? now,
        now,
        syncStatus,
        fields.deleted_at ?? null,
      ],
    );
    return;
  }

  if (table === "local_integrity_events") {
    await exec.execute(
      `INSERT OR REPLACE INTO local_integrity_events (
        id, exam_id, student_id, event_type, severity, payload_json, created_at, last_synced_at, sync_status, client_mutation_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        fields.exam_id ?? null,
        fields.student_id ?? null,
        fields.event_type ?? null,
        fields.severity ?? null,
        payload,
        fields.created_at ?? now,
        now,
        syncStatus,
        fields.client_mutation_id ?? null,
      ],
    );
  }
}

export async function getLocalEntityById(
  table: EntityTable,
  id: string,
): Promise<Record<string, unknown> | null> {
  const exec = await db();
  if (!exec) return null;
  const idCol = table === "local_exam_settings" ? "exam_id" : "id";
  const res = await exec.execute(`SELECT * FROM ${table} WHERE ${idCol} = ?`, [id]);
  return res.rows[0] ?? null;
}

export async function listLocalByUser(
  table: "local_notifications",
  recipientUserId: string,
): Promise<Record<string, unknown>[]> {
  const exec = await db();
  if (!exec) return [];
  const res = await exec.execute(
    `SELECT * FROM ${table} WHERE recipient_user_id = ?`,
    [recipientUserId],
  );
  return res.rows;
}
