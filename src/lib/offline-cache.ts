/**
 * Offline-first structured cache (IndexedDB).
 * Per-user isolation. Never stores secrets or service-role keys.
 * Does not change UI — pure data layer for offline reads + sync metadata.
 */

const DB_NAME = "d4exam-offline-v1";
const DB_VERSION = 1;
const STORE = "cache";

export type OfflineEnvelope<T> = {
  data: T;
  userId: string;
  schoolId: string | null;
  lastSyncedAt: number;
  source: "network" | "local" | "sync";
};

function scopeKey(userId: string, key: string) {
  return `${userId}::${key}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function offlineGet<T>(
  userId: string,
  key: string,
): Promise<OfflineEnvelope<T> | null> {
  if (!userId) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(scopeKey(userId, key));
      req.onsuccess = () => resolve((req.result as OfflineEnvelope<T>) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function offlineSet<T>(
  userId: string,
  key: string,
  data: T,
  opts?: { schoolId?: string | null },
): Promise<void> {
  if (!userId) return;
  try {
    const db = await openDb();
    const envelope: OfflineEnvelope<T> = {
      data,
      userId,
      schoolId: opts?.schoolId ?? null,
      lastSyncedAt: Date.now(),
      source: "network",
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(envelope, scopeKey(userId, key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* quota / private mode */
  }
}

export async function offlineRemove(userId: string, key: string): Promise<void> {
  if (!userId) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(scopeKey(userId, key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** Clear all keys for a user (call on logout). */
export async function offlineClearUser(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const db = await openDb();
    const prefix = `${userId}::`;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** Standard cache keys used across the app. */
export const OfflineKeys = {
  profile: "profile",
  school: "school",
  studentContext: "student.context",
  studentResults: "student.results",
  studentExams: "student.exams",
  studentDashboardExams: "student.dashboard.exams",
  studentDashboardAttempts: "student.dashboard.attempts",
  studentDashboardResults: "student.dashboard.results",
  studentDashboardNotifs: "student.dashboard.notifs",
  studentExamAttempts: "student.exam.attempts",
  notifications: "notifications",
  materialsIndex: "materials.index",
  settings: "settings",
  courses: "courses",
  sessionUser: "session.user",
  teacherContext: "teacher.context",
  teacherWorkspace: "teacher.workspace",
  officerDashboard: "officer.dashboard",
  adminDashboard: "admin.dashboard",
  unreadNotifications: "notifications.unread",
  schoolIdentity: "school.identity",
  adminStudents: "admin.students",
  adminFaculties: "admin.faculties",
  adminDepartments: "admin.departments",
  adminLevels: "admin.levels",
  rowsPrefix: "rows.",
} as const;

export function formatLastSynced(ts: number | null | undefined): string | null {
  if (!ts) return null;
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "Last updated just now";
  if (mins < 60) return `Last updated ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Last updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Last updated ${days} day${days === 1 ? "" : "s"} ago`;
}
