/**
 * Local DB connection bootstrap.
 * - Native Android/iOS: @capacitor-community/sqlite
 * - Web / SSR: in-memory fallback so the website never breaks
 */

import { Capacitor } from "@capacitor/core";
import { LOCAL_DB_NAME, LOCAL_DB_VERSION, LOCAL_SCHEMA_SQL, LOCAL_MIGRATIONS } from "./schema";
import type { LocalDbCapability } from "./types";

export type SqlResult = {
  rows: Record<string, unknown>[];
  changes?: number;
  lastId?: number | string | null;
};

export interface LocalDbExecutor {
  execute(sql: string, params?: unknown[]): Promise<SqlResult>;
  runBatch?(statements: { sql: string; params?: unknown[] }[]): Promise<void>;
  close?(): Promise<void>;
}

type MemoryDb = Map<string, Map<string, Record<string, unknown>>>;

let executor: LocalDbExecutor | null = null;
let capability: LocalDbCapability = {
  available: false,
  backend: "none",
  dbName: LOCAL_DB_NAME,
  version: LOCAL_DB_VERSION,
};
let initPromise: Promise<LocalDbExecutor | null> | null = null;

function createMemoryExecutor(): LocalDbExecutor {
  const tables: MemoryDb = new Map();
  const ensure = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };

  return {
    async execute(sql: string, params: unknown[] = []): Promise<SqlResult> {
      const s = sql.trim();
      const up = s.toUpperCase();

      if (up.startsWith("CREATE TABLE") || up.startsWith("CREATE INDEX") || up.startsWith("CREATE UNIQUE")) {
        const m = s.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
        if (m) ensure(m[1]);
        return { rows: [] };
      }

      if (up.startsWith("INSERT OR REPLACE INTO") || up.startsWith("INSERT INTO")) {
        const m = s.match(/INTO\s+(\w+)\s*\(([^)]+)\)/i);
        if (!m) return { rows: [], changes: 0 };
        const table = m[1];
        const cols = m[2].split(",").map((c) => c.trim());
        const row: Record<string, unknown> = {};
        cols.forEach((c, i) => {
          row[c] = params[i] ?? null;
        });
        const pk =
          (row.id as string) ||
          (row.user_id as string) ||
          (row.key as string) ||
          (row.exam_id as string) ||
          String(Math.random());
        ensure(table).set(String(pk), row);
        return { rows: [], changes: 1, lastId: pk };
      }

      if (up.startsWith("SELECT")) {
        const m = s.match(/FROM\s+(\w+)/i);
        if (!m) return { rows: [] };
        const table = m[1];
        const all = [...ensure(table).values()];
        const where = s.match(/WHERE\s+(\w+)\s*=\s*\?/i);
        if (where && params.length) {
          const col = where[1];
          return { rows: all.filter((r) => String(r[col]) === String(params[0])) };
        }
        return { rows: all };
      }

      if (up.startsWith("UPDATE") || up.startsWith("DELETE")) {
        return { rows: [], changes: 0 };
      }

      return { rows: [] };
    },
  };
}

async function createNativeExecutor(): Promise<LocalDbExecutor | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
    const connection = new SQLiteConnection(CapacitorSQLite);
    const consistency = await connection.checkConnectionsConsistency();
    const isConn = (await connection.isConnection(LOCAL_DB_NAME, false)).result;
    let db;
    if (consistency.result && isConn) {
      db = await connection.retrieveConnection(LOCAL_DB_NAME, false);
    } else {
      db = await connection.createConnection(LOCAL_DB_NAME, false, "no-encryption", LOCAL_DB_VERSION, false);
    }
    await db.open();
    for (const stmt of LOCAL_SCHEMA_SQL) {
      await db.execute(stmt);
    }
    for (const mig of LOCAL_MIGRATIONS) {
      if (mig.version <= LOCAL_DB_VERSION) {
        for (const stmt of mig.statements) {
          await db.execute(stmt);
        }
      }
    }
    await db.run(
      `INSERT OR REPLACE INTO local_meta (key, value, updated_at) VALUES (?,?,datetime('now'))`,
      ["schema_version", String(LOCAL_DB_VERSION)],
    );

    return {
      async execute(sql: string, params: unknown[] = []): Promise<SqlResult> {
        if (/^\s*SELECT/i.test(sql)) {
          const res = await db.query(sql, params as (string | number | null)[]);
          return { rows: (res.values ?? []) as Record<string, unknown>[] };
        }
        const res = await db.run(sql, params as (string | number | null)[]);
        return {
          rows: [],
          changes: res.changes?.changes ?? 0,
          lastId: res.changes?.lastId ?? null,
        };
      },
      async close() {
        try {
          await connection.closeConnection(LOCAL_DB_NAME, false);
        } catch {
          /* ignore */
        }
      },
    };
  } catch (e) {
    console.warn("[local-db] native SQLite init failed; using memory fallback", e);
    return null;
  }
}

export async function initLocalDb(opts?: { forceMemory?: boolean }): Promise<LocalDbExecutor | null> {
  if (executor) return executor;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (opts?.forceMemory || typeof window === "undefined") {
      executor = createMemoryExecutor();
      for (const stmt of LOCAL_SCHEMA_SQL) {
        await executor.execute(stmt);
      }
      for (const mig of LOCAL_MIGRATIONS) {
        if (mig.version <= LOCAL_DB_VERSION) {
          for (const stmt of mig.statements) {
            await executor.execute(stmt);
          }
        }
      }
      capability = {
        available: true,
        backend: "memory",
        dbName: LOCAL_DB_NAME,
        version: LOCAL_DB_VERSION,
      };
      return executor;
    }

    const native = await createNativeExecutor();
    if (native) {
      executor = native;
      capability = {
        available: true,
        backend: "sqlite-native",
        dbName: LOCAL_DB_NAME,
        version: LOCAL_DB_VERSION,
      };
      return executor;
    }

    executor = createMemoryExecutor();
    for (const stmt of LOCAL_SCHEMA_SQL) {
      await executor.execute(stmt);
    }
    for (const mig of LOCAL_MIGRATIONS) {
      if (mig.version <= LOCAL_DB_VERSION) {
        for (const stmt of mig.statements) {
          await executor.execute(stmt);
        }
      }
    }
    capability = {
      available: true,
      backend: "memory",
      dbName: LOCAL_DB_NAME,
      version: LOCAL_DB_VERSION,
    };
    return executor;
  })();

  return initPromise;
}

export function getLocalDb(): LocalDbExecutor | null {
  return executor;
}

export function getLocalDbCapability(): LocalDbCapability {
  return { ...capability };
}

export async function __resetLocalDbForTests(): Promise<void> {
  if (executor?.close) await executor.close().catch(() => undefined);
  executor = null;
  initPromise = null;
  capability = {
    available: false,
    backend: "none",
    dbName: LOCAL_DB_NAME,
    version: LOCAL_DB_VERSION,
  };
}
