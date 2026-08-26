import { readFileSync } from "node:fs";
import path from "node:path";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

const schemaPath = path.join(process.cwd(), "src/lib/local-db/schema.ts");
const schemaSrc = readFileSync(schemaPath, "utf8");
assert(schemaSrc.includes("local_session"), "schema has local_session");
assert(schemaSrc.includes("local_outbox"), "schema has local_outbox");
assert(schemaSrc.includes("local_sync_state"), "schema has local_sync_state");
assert(!/password\s+TEXT/i.test(schemaSrc), "must not define password columns");
assert(!/\bpassword\s*=/i.test(schemaSrc), "must not assign password fields");

const match = schemaSrc.match(/export const LOCAL_SCHEMA_SQL[^=]*=\s*\[([\s\S]*?)\];/);
assert(match, "LOCAL_SCHEMA_SQL export found");
const statements = [...match[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
assert(statements.length >= 10, `expected many DDL statements, got ${statements.length}`);

const tables = new Set();
for (const s of statements) {
  const m = s.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
  if (m) tables.add(m[1]);
}
const required = [
  "local_meta","local_session","local_schools","local_courses","local_examinations",
  "local_exam_settings","local_notifications","local_results","local_materials",
  "local_exam_attempts","local_integrity_events","local_sync_state","local_outbox",
];
for (const t of required) assert(tables.has(t), `missing table ${t}`);

console.log("OK: schema defines", tables.size, "tables,", statements.length, "statements");
console.log("ALL LOCAL-DB SCHEMA TESTS PASSED");
