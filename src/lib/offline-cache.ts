/**
 * Offline-first structured cache (IndexedDB).
 * Per-user isolation. Never stores secrets or service-role keys.
 * Does not change UI — pure data layer for offline reads + sync metadata.
 */

const DB_NAME = "d4exam-offline-v1";
const DB_VERSION = 1;
const STORE = "kv";

export type OfflineEnvelope<T> = {
  data: T;
  userId: string;
  schoolId?: string | null;
  lastSyncedAt: number;
  source: "network" | "cache";
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function scopeKey(userId: string, key: string): string {
  return `${userId}::${key}`;
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
      req.onsuccess = () => {
        const v = req.result as OfflineEnvelope<T> | undefined;
        resolve(v ?? null);
      };
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
  studentResults: "student.results",
  studentExams: "student.exams",
  notifications: "notifications",
  materialsIndex: "materials.index",
  settings: "settings",
  courses: "courses",
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
