/**
 * D4EXAM local SQLite schema (Step 2 foundation).
 * Server UUIDs are stored as TEXT and match Supabase ids where possible.
 * Never stores user secrets in clear form.
 */

export const LOCAL_DB_NAME = "d4exam_local";
export const LOCAL_DB_VERSION = 1;

/** Ordered DDL — safe to run with IF NOT EXISTS */
export const LOCAL_SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS local_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS local_session (
    user_id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT,
    email TEXT,
    full_name TEXT,
    status TEXT,
    school_id TEXT,
    school_name TEXT,
    roles_json TEXT NOT NULL DEFAULT '[]',
    primary_role TEXT,
    /* opaque session hints only — never password */
    access_token_expires_at TEXT,
    has_refresh_session INTEGER NOT NULL DEFAULT 0,
    last_validated_at TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    sync_status TEXT NOT NULL DEFAULT 'synced'
  )`,

  `CREATE TABLE IF NOT EXISTS local_schools (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    code TEXT,
    payload_json TEXT,
    updated_at TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS local_courses (
    id TEXT PRIMARY KEY NOT NULL,
    school_id TEXT,
    code TEXT,
    name TEXT,
    payload_json TEXT,
    updated_at TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_courses_school ON local_courses(school_id)`,

  `CREATE TABLE IF NOT EXISTS local_examinations (
    id TEXT PRIMARY KEY NOT NULL,
    school_id TEXT,
    course_id TEXT,
    title TEXT,
    status TEXT,
    scheduled_start TEXT,
    scheduled_end TEXT,
    duration_minutes INTEGER,
    /* metadata only in Step 2 — no full question bank payload required yet */
    payload_json TEXT,
    updated_at TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_exams_school ON local_examinations(school_id)`,
  `CREATE INDEX IF NOT EXISTS idx_local_exams_course ON local_examinations(course_id)`,

  `CREATE TABLE IF NOT EXISTS local_exam_settings (
    exam_id TEXT PRIMARY KEY NOT NULL,
    payload_json TEXT,
    updated_at TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced'
  )`,

  `CREATE TABLE IF NOT EXISTS local_notifications (
    id TEXT PRIMARY KEY NOT NULL,
    recipient_user_id TEXT NOT NULL,
    school_id TEXT,
    title TEXT,
    message TEXT,
    type TEXT,
    link TEXT,
    read_at TEXT,
    created_at TEXT,
    payload_json TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_notif_user ON local_notifications(recipient_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_local_notif_created ON local_notifications(created_at)`,

  `CREATE TABLE IF NOT EXISTS local_results (
    id TEXT PRIMARY KEY NOT NULL,
    student_id TEXT,
    exam_id TEXT,
    school_id TEXT,
    score REAL,
    max_score REAL,
    published INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT,
    updated_at TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_results_student ON local_results(student_id)`,

  `CREATE TABLE IF NOT EXISTS local_materials (
    id TEXT PRIMARY KEY NOT NULL,
    school_id TEXT,
    title TEXT,
    payload_json TEXT,
    updated_at TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS local_exam_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    exam_id TEXT,
    student_id TEXT,
    status TEXT,
    started_at TEXT,
    submitted_at TEXT,
    /* answers_json reserved for future offline CBT — unused in Step 2 product paths */
    answers_json TEXT,
    payload_json TEXT,
    client_mutation_id TEXT,
    updated_at TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_attempts_student ON local_exam_attempts(student_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_local_attempts_mutation ON local_exam_attempts(client_mutation_id) WHERE client_mutation_id IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS local_integrity_events (
    id TEXT PRIMARY KEY NOT NULL,
    exam_id TEXT,
    student_id TEXT,
    event_type TEXT,
    severity TEXT,
    payload_json TEXT,
    created_at TEXT,
    last_synced_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    client_mutation_id TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS local_sync_state (
    entity TEXT PRIMARY KEY NOT NULL,
    scope_key TEXT NOT NULL DEFAULT '',
    last_synced_at TEXT,
    cursor TEXT,
    extra_json TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_local_sync_entity_scope ON local_sync_state(entity, scope_key)`,

  `CREATE TABLE IF NOT EXISTS local_outbox (
    id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    available_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_outbox_status ON local_outbox(status, created_at)`,
];

export type SyncStatus = "synced" | "pending" | "failed" | "conflict" | "deleted";
